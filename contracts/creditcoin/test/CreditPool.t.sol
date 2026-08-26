// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Test} from "forge-std/Test.sol";
import {CreditPool} from "../src/CreditPool.sol";
import {TestUSDC} from "../src/TestUSDC.sol";
import {FixedPriceOracle} from "../src/FixedPriceOracle.sol";
import {IStreamVerifier} from "../src/interfaces/IStreamVerifier.sol";

contract MockVerifier is IStreamVerifier {
    mapping(address => uint256) public locked;

    function setRemainingLocked(address user, uint256 amount) external {
        locked[user] = amount;
    }

    function remainingLocked(address user) external view returns (uint256) {
        return locked[user];
    }
}

contract CreditPoolTest is Test {
    CreditPool pool;
    TestUSDC usdc;
    MockVerifier verifier;
    FixedPriceOracle oracle;

    address borrower = makeAddr("borrower");
    address lp = makeAddr("lp");
    address lp2 = makeAddr("lp2");

    uint256 constant PRICE_USD_PER_ETH = 3000;

    function setUp() public {
        usdc = new TestUSDC();
        verifier = new MockVerifier();
        oracle = new FixedPriceOracle(PRICE_USD_PER_ETH * 1e8);
        pool = new CreditPool(address(usdc), address(verifier), address(oracle));

        _seedLP(lp, 10_000 * 1e6);
        verifier.setRemainingLocked(borrower, _weiFor(6000 * 1e6)); // $6000 unvested, at $3000/ETH
    }

    /// Converts a 6-decimal USD collateral value into the wei of ETH that produces it,
    /// given this test's fixed oracle price — so test expectations can stay expressed in
    /// USD (tUSDC) terms like before, instead of everyone hand-computing wei amounts.
    function _weiFor(uint256 usd6) internal pure returns (uint256) {
        return usd6 * 1e12 / PRICE_USD_PER_ETH;
    }

    function _seedLP(address who, uint256 amount) internal {
        vm.startPrank(who);
        while (usdc.balanceOf(who) < amount) {
            usdc.faucet();
            vm.warp(block.timestamp + 1 days + 1);
        }
        usdc.approve(address(pool), type(uint256).max);
        pool.deposit(amount);
        vm.stopPrank();
    }

    function _giveUSDC(address who, uint256 amount) internal {
        deal(address(usdc), who, usdc.balanceOf(who) + amount);
    }

    // =================================================================
    // collateralValue (wei -> USD conversion via the price oracle)
    // =================================================================

    function test_collateralValue_zeroWhenNoLockedValue() public {
        verifier.setRemainingLocked(borrower, 0);
        assertEq(pool.collateralValue(borrower), 0);
    }

    function test_collateralValue_convertsWeiToUsdAtOraclePrice() public {
        verifier.setRemainingLocked(borrower, 1 ether); // 1 ETH at $3000/ETH
        assertEq(pool.collateralValue(borrower), 3000 * 1e6);
    }

    function test_collateralValue_scalesLinearlyWithWeiAmount() public {
        verifier.setRemainingLocked(borrower, 2 ether);
        assertEq(pool.collateralValue(borrower), 6000 * 1e6);
    }

    function test_collateralValue_risesWhenOraclePriceRises() public {
        verifier.setRemainingLocked(borrower, 1 ether);
        oracle.setPrice(6000 * 1e8); // ETH doubles in price
        assertEq(pool.collateralValue(borrower), 6000 * 1e6);
    }

    function test_collateralValue_fallsWhenOraclePriceFalls() public {
        verifier.setRemainingLocked(borrower, 1 ether);
        oracle.setPrice(1500 * 1e8); // ETH halves in price
        assertEq(pool.collateralValue(borrower), 1500 * 1e6);
    }

    function test_creditLimit_isHalfOfCollateralValueAtBaseLTV() public {
        verifier.setRemainingLocked(borrower, 1 ether);
        assertEq(pool.creditLimit(borrower), pool.collateralValue(borrower) * 5000 / 10_000);
    }

    // =================================================================
    // creditLimit
    // =================================================================

    function test_creditLimit_baseLTV() public view {
        assertEq(pool.creditLimit(borrower), 3000 * 1e6); // 50% of 6000
    }

    function test_creditLimit_zeroWhenNoLockedValue() public {
        verifier.setRemainingLocked(borrower, 0);
        assertEq(pool.creditLimit(borrower), 0);
    }

    function test_creditLimit_scalesWithRemainingLocked() public {
        verifier.setRemainingLocked(borrower, _weiFor(10_000 * 1e6));
        // _weiFor and the contract's own wei->USD conversion each truncate on integer
        // division, so round-tripping isn't exact — off by at most 1 unit of tUSDC.
        assertApproxEqAbs(pool.creditLimit(borrower), 5000 * 1e6, 1);
    }

    function test_creditLimit_stepsUpWithRepaidLoans() public {
        // repaidLoans only moves via _checkFullRepay, so drive it with borrow then repay
        // cycles that carry zero garnish, so each cycle increments cleanly.
        for (uint256 i = 0; i < 4; i++) {
            uint256 expectedBps = 5000 + i * 500; // 50, 55, 60, 65
            assertEq(pool.creditLimit(borrower), 6000 * 1e6 * expectedBps / 10_000);

            uint256 amount = 100 * 1e6; // small, always affordable regardless of LTV tier
            vm.prank(borrower);
            pool.borrow(amount);

            uint256 owed = pool.debt(borrower);
            _giveUSDC(borrower, owed);
            vm.startPrank(borrower);
            usdc.approve(address(pool), owed);
            pool.repay(owed);
            vm.stopPrank();

            assertEq(pool.repaidLoans(borrower), i + 1);
        }
    }

    function test_creditLimit_capsAtMaxLTV() public {
        // Force repaidLoans far past the point where the LTV formula would exceed 70%.
        for (uint256 i = 0; i < 6; i++) {
            uint256 amount = 100 * 1e6;
            vm.prank(borrower);
            pool.borrow(amount);
            uint256 owed = pool.debt(borrower);
            _giveUSDC(borrower, owed);
            vm.startPrank(borrower);
            usdc.approve(address(pool), owed);
            pool.repay(owed);
            vm.stopPrank();
        }

        assertEq(pool.repaidLoans(borrower), 6); // would be 50+6*5=80% uncapped
        assertEq(pool.creditLimit(borrower), 6000 * 1e6 * 7000 / 10_000); // capped at 70%
    }

    function testFuzz_creditLimit_neverExceedsMaxLTV(uint96 remainingLocked, uint8 repaidLoanCycles) public {
        verifier.setRemainingLocked(borrower, remainingLocked);
        uint256 cycles = repaidLoanCycles % 8; // keep the fuzz run cheap; 8 cycles already exceeds the cap
        for (uint256 i = 0; i < cycles; i++) {
            uint256 limit = pool.creditLimit(borrower);
            if (limit == 0) break; // nothing left to borrow against
            uint256 amount = limit * 10_000 / 10_500; // solves amount*1.05 <= limit
            if (amount == 0) break;

            vm.prank(borrower);
            try pool.borrow(amount) {
                uint256 owed = pool.debt(borrower);
                _giveUSDC(borrower, owed);
                vm.startPrank(borrower);
                usdc.approve(address(pool), owed);
                pool.repay(owed);
                vm.stopPrank();
            } catch {
                // Pool ran out of tUSDC liquidity for this fuzzed remainingLocked, so stop
                // growing repaidLoans. The final assertion still holds either way.
                break;
            }
        }

        assertLe(pool.creditLimit(borrower), pool.collateralValue(borrower) * 7000 / 10_000);
    }

    // =================================================================
    // borrow
    // =================================================================

    function test_borrow_withinLimit() public {
        vm.prank(borrower);
        pool.borrow(1000 * 1e6);
        assertEq(usdc.balanceOf(borrower), 1000 * 1e6);
        assertEq(pool.debt(borrower), 1050 * 1e6); // + 5% flat interest
    }

    function test_borrow_exceedsLimit_reverts() public {
        vm.prank(borrower);
        vm.expectRevert("exceeds credit limit");
        pool.borrow(2900 * 1e6); // 2900 * 1.05 > 3000
    }

    function test_borrow_exactlyAtLimit_succeeds() public {
        // amount * 1.05 == limit exactly  =>  amount == limit / 1.05
        uint256 limit = pool.creditLimit(borrower); // 3000e6
        uint256 amount = limit * 10_000 / 10_500; // solves amount*1.05 == limit (rounds down)
        vm.prank(borrower);
        pool.borrow(amount);
        assertLe(pool.debt(borrower), limit);
    }

    function test_borrow_oneWeiOverLimit_reverts() public {
        // Binary-search-free approach: use an amount whose 5%-inflated debt is exactly
        // limit + 1 by construction.
        uint256 limit = pool.creditLimit(borrower);
        // amount such that amount + amount*5% == limit + 1
        uint256 amount = (limit + 1) * 10_000 / 10_500 + 1;
        vm.assume(amount + (amount * 500 / 10_000) > limit);
        vm.prank(borrower);
        vm.expectRevert("exceeds credit limit");
        pool.borrow(amount);
    }

    function test_borrow_revertsWhenFrozen() public {
        vm.prank(address(verifier));
        pool.onStreamCancelled(borrower);

        vm.prank(borrower);
        vm.expectRevert("stream cancelled");
        pool.borrow(100 * 1e6);
    }

    function test_borrow_revertsWhenPendingGarnishNonzero() public {
        vm.prank(borrower);
        pool.borrow(1000 * 1e6);
        vm.prank(address(verifier));
        pool.onSalaryWithdrawn(borrower, _weiFor(1000 * 1e6));

        vm.prank(borrower);
        vm.expectRevert("settle garnish first");
        pool.borrow(100 * 1e6);
    }

    function test_borrow_multipleBorrows_accumulateDebt() public {
        vm.startPrank(borrower);
        pool.borrow(500 * 1e6);
        pool.borrow(500 * 1e6);
        vm.stopPrank();

        assertEq(pool.debt(borrower), 500 * 1e6 * 2 * 10_500 / 10_000);
        assertEq(usdc.balanceOf(borrower), 1000 * 1e6);
    }

    function test_borrow_interestRoundsDown() public {
        // 7 * 500 / 10000 rounds down to 0
        vm.prank(borrower);
        pool.borrow(7);
        assertEq(pool.debt(borrower), 7); // no interest charged on dust amounts
    }

    function test_borrow_emitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit CreditPool.Borrowed(borrower, 1000 * 1e6, 1050 * 1e6);

        vm.prank(borrower);
        pool.borrow(1000 * 1e6);
    }

    function testFuzz_borrow_neverExceedsCreditLimit(uint96 remainingLocked, uint96 amountSeed) public {
        verifier.setRemainingLocked(borrower, remainingLocked);
        uint256 limit = pool.creditLimit(borrower);
        vm.assume(limit > 0);
        uint256 amount = uint256(amountSeed) % (limit * 2 + 1); // sample both sides of the limit

        vm.prank(borrower);
        try pool.borrow(amount) {
            assertLe(pool.debt(borrower), limit);
        } catch {
            // Either exceeds credit limit or the pool lacks enough tUSDC liquidity for this
            // fuzzed amount. Either way, no debt should be recorded.
            assertEq(pool.debt(borrower), 0);
        }
    }

    // =================================================================
    // onSalaryWithdrawn
    // =================================================================

    function test_onSalaryWithdrawn_recordsGarnish_freezesBorrow() public {
        vm.prank(borrower);
        pool.borrow(1000 * 1e6);

        vm.prank(address(verifier));
        pool.onSalaryWithdrawn(borrower, _weiFor(1000 * 1e6)); // 30% of 1000 = 300

        // _weiFor and the contract's wei->USD conversion each truncate, so this can land
        // a unit below the round number.
        assertApproxEqAbs(pool.pendingGarnish(borrower), 300 * 1e6, 1);

        vm.prank(borrower);
        vm.expectRevert("settle garnish first");
        pool.borrow(100 * 1e6);
    }

    function test_onSalaryWithdrawn_noOpWhenNoDebt() public {
        vm.prank(address(verifier));
        pool.onSalaryWithdrawn(borrower, _weiFor(1000 * 1e6));
        assertEq(pool.pendingGarnish(borrower), 0);
    }

    function test_onSalaryWithdrawn_capsAtCurrentDebt() public {
        vm.prank(borrower);
        pool.borrow(100 * 1e6); // debt = 105e6

        vm.prank(address(verifier));
        pool.onSalaryWithdrawn(borrower, _weiFor(1_000_000 * 1e6)); // 30% would be huge

        assertEq(pool.pendingGarnish(borrower), pool.debt(borrower)); // capped at debt, not 30%
    }

    function test_onSalaryWithdrawn_multipleCallsCanExceedDebt() public {
        // Each call caps against current debt independently, so repeated withdrawals
        // before settlement can push pendingGarnish above debt.
        vm.prank(borrower);
        pool.borrow(1000 * 1e6); // debt = 1050e6

        vm.startPrank(address(verifier));
        pool.onSalaryWithdrawn(borrower, _weiFor(10_000 * 1e6)); // garnish = min(3000e6, 1050e6) = 1050e6
        pool.onSalaryWithdrawn(borrower, _weiFor(10_000 * 1e6)); // garnish again = min(3000e6, 1050e6) = 1050e6
        vm.stopPrank();

        assertEq(pool.pendingGarnish(borrower), 2100 * 1e6);
        assertGt(pool.pendingGarnish(borrower), pool.debt(borrower));
    }

    function test_onlyVerifier_canCallOnSalaryWithdrawn() public {
        vm.expectRevert("not verifier");
        pool.onSalaryWithdrawn(borrower, _weiFor(100 * 1e6));
    }

    function test_onlyVerifier_canCallOnStreamCancelled() public {
        vm.expectRevert("not verifier");
        pool.onStreamCancelled(borrower);
    }

    // =================================================================
    // onStreamCancelled
    // =================================================================

    function test_onStreamCancelled_freezesBorrowing() public {
        assertFalse(pool.frozen(borrower));

        vm.prank(address(verifier));
        pool.onStreamCancelled(borrower);

        assertTrue(pool.frozen(borrower));
        vm.prank(borrower);
        vm.expectRevert("stream cancelled");
        pool.borrow(1 * 1e6);
    }

    function test_onStreamCancelled_doesNotTouchDebtOrGarnish() public {
        vm.prank(borrower);
        pool.borrow(1000 * 1e6);
        uint256 debtBefore = pool.debt(borrower);

        vm.prank(address(verifier));
        pool.onStreamCancelled(borrower);

        assertEq(pool.debt(borrower), debtBefore);
        assertEq(pool.pendingGarnish(borrower), 0);
    }

    function test_onStreamCancelled_emitsEvent() public {
        vm.expectEmit(true, false, false, false);
        emit CreditPool.StreamFrozen(borrower);

        vm.prank(address(verifier));
        pool.onStreamCancelled(borrower);
    }

    // =================================================================
    // settleGarnish
    // =================================================================

    function test_settleGarnish_reopensBorrowing() public {
        vm.prank(borrower);
        pool.borrow(1000 * 1e6);
        vm.prank(address(verifier));
        pool.onSalaryWithdrawn(borrower, _weiFor(1000 * 1e6));

        uint256 pending = pool.pendingGarnish(borrower); // ~300e6, off by truncation
        uint256 debtBefore = pool.debt(borrower);
        _giveUSDC(borrower, pending);
        vm.startPrank(borrower);
        usdc.approve(address(pool), pending);
        pool.settleGarnish(pending);
        vm.stopPrank();

        assertEq(pool.pendingGarnish(borrower), 0);
        assertEq(pool.debt(borrower), debtBefore - pending);
    }

    function test_settleGarnish_partialSettlement() public {
        vm.prank(borrower);
        pool.borrow(1000 * 1e6);
        vm.prank(address(verifier));
        pool.onSalaryWithdrawn(borrower, _weiFor(1000 * 1e6)); // pendingGarnish ~ 300e6

        uint256 pendingBefore = pool.pendingGarnish(borrower);
        _giveUSDC(borrower, 100 * 1e6);
        vm.startPrank(borrower);
        usdc.approve(address(pool), 100 * 1e6);
        pool.settleGarnish(100 * 1e6);
        vm.stopPrank();

        assertEq(pool.pendingGarnish(borrower), pendingBefore - 100 * 1e6);
        // Still frozen for borrowing since pendingGarnish != 0.
        vm.prank(borrower);
        vm.expectRevert("settle garnish first");
        pool.borrow(1 * 1e6);
    }

    function test_settleGarnish_revertsAboveOutstandingGarnish() public {
        vm.prank(borrower);
        pool.borrow(1000 * 1e6);
        vm.prank(address(verifier));
        pool.onSalaryWithdrawn(borrower, _weiFor(1000 * 1e6)); // pendingGarnish = 300e6

        _giveUSDC(borrower, 400 * 1e6);
        vm.startPrank(borrower);
        usdc.approve(address(pool), 400 * 1e6);
        vm.expectRevert("invalid amount");
        pool.settleGarnish(400 * 1e6);
        vm.stopPrank();
    }

    function test_settleGarnish_revertsZeroAmount() public {
        vm.prank(borrower);
        vm.expectRevert("invalid amount");
        pool.settleGarnish(0);
    }

    /// @dev Repeated onSalaryWithdrawn calls can leave pendingGarnish above debt. Settling
    ///      in full should floor debt at 0 instead of reverting.
    function test_settleGarnish_whenPendingExceedsDebt_floorsDebtAtZeroWithoutReverting() public {
        vm.prank(borrower);
        pool.borrow(1000 * 1e6); // debt = 1050e6

        vm.startPrank(address(verifier));
        pool.onSalaryWithdrawn(borrower, _weiFor(10_000 * 1e6)); // garnish = 1050e6
        pool.onSalaryWithdrawn(borrower, _weiFor(10_000 * 1e6)); // garnish again = 1050e6
        vm.stopPrank();

        uint256 pending = pool.pendingGarnish(borrower); // 2100e6, far above debt (1050e6)
        assertGt(pending, pool.debt(borrower));

        _giveUSDC(borrower, pending);
        vm.startPrank(borrower);
        usdc.approve(address(pool), pending);
        pool.settleGarnish(pending); // must NOT revert
        vm.stopPrank();

        assertEq(pool.pendingGarnish(borrower), 0);
        assertEq(pool.debt(borrower), 0);
    }

    /// @dev Second trigger path: repay() reduces debt independently of
    ///      pendingGarnish, so settling garnish afterwards must still not underflow.
    function test_settleGarnish_afterFullRepay_doesNotRevert() public {
        vm.prank(borrower);
        pool.borrow(1000 * 1e6); // debt = 1050e6
        vm.prank(address(verifier));
        pool.onSalaryWithdrawn(borrower, _weiFor(1000 * 1e6)); // pendingGarnish = 300e6

        _giveUSDC(borrower, 1050 * 1e6);
        vm.startPrank(borrower);
        usdc.approve(address(pool), 1050 * 1e6);
        pool.repay(1050 * 1e6); // debt drops to 0, pendingGarnish stays at ~300e6
        vm.stopPrank();

        assertEq(pool.debt(borrower), 0);
        uint256 pending = pool.pendingGarnish(borrower);
        assertApproxEqAbs(pending, 300 * 1e6, 1);

        _giveUSDC(borrower, pending);
        vm.startPrank(borrower);
        usdc.approve(address(pool), pending);
        pool.settleGarnish(pending); // must NOT revert even though debt is already 0
        vm.stopPrank();

        assertEq(pool.debt(borrower), 0);
        assertEq(pool.pendingGarnish(borrower), 0);
        assertEq(pool.repaidLoans(borrower), 1); // now both debt and garnish are clear
    }

    function test_settleGarnish_triggersFullRepayWhenBothZero() public {
        vm.prank(borrower);
        pool.borrow(1000 * 1e6); // debt = 1050e6, no oracle conversion involved, exact
        vm.prank(address(verifier));
        pool.onSalaryWithdrawn(borrower, _weiFor(1000 * 1e6)); // pendingGarnish ~ 300e6

        // Repay down to exactly `pending`, so settling it in full zeroes out both.
        uint256 pending = pool.pendingGarnish(borrower);
        uint256 repayAmount = pool.debt(borrower) - pending;
        _giveUSDC(borrower, repayAmount);
        vm.startPrank(borrower);
        usdc.approve(address(pool), repayAmount);
        pool.repay(repayAmount);
        vm.stopPrank();

        assertEq(pool.repaidLoans(borrower), 0); // pendingGarnish still nonzero

        _giveUSDC(borrower, pending);
        vm.startPrank(borrower);
        usdc.approve(address(pool), pending);
        pool.settleGarnish(pending); // clears both debt and pendingGarnish together
        vm.stopPrank();

        assertEq(pool.repaidLoans(borrower), 1);
    }

    // =================================================================
    // repay
    // =================================================================

    function test_repay_partial() public {
        vm.prank(borrower);
        pool.borrow(1000 * 1e6); // debt = 1050e6

        _giveUSDC(borrower, 500 * 1e6);
        vm.startPrank(borrower);
        usdc.approve(address(pool), 500 * 1e6);
        pool.repay(500 * 1e6);
        vm.stopPrank();

        assertEq(pool.debt(borrower), 550 * 1e6);
    }

    function test_repay_full_incrementsRepaidLoans() public {
        vm.prank(borrower);
        pool.borrow(1000 * 1e6);
        uint256 owed = pool.debt(borrower);

        _giveUSDC(borrower, owed);
        vm.startPrank(borrower);
        usdc.approve(address(pool), owed);
        pool.repay(owed);
        vm.stopPrank();

        assertEq(pool.debt(borrower), 0);
        assertEq(pool.repaidLoans(borrower), 1);
    }

    function test_repay_doesNotIncrementRepaidLoansIfGarnishPending() public {
        vm.prank(borrower);
        pool.borrow(1000 * 1e6);
        vm.prank(address(verifier));
        pool.onSalaryWithdrawn(borrower, _weiFor(1000 * 1e6)); // pendingGarnish = 300e6

        uint256 owed = pool.debt(borrower);
        _giveUSDC(borrower, owed);
        vm.startPrank(borrower);
        usdc.approve(address(pool), owed);
        pool.repay(owed); // debt drops to 0, pendingGarnish still 300e6
        vm.stopPrank();

        assertEq(pool.debt(borrower), 0);
        assertEq(pool.repaidLoans(borrower), 0); // not yet, garnish still outstanding
    }

    function test_repay_revertsAboveDebt() public {
        vm.prank(borrower);
        pool.borrow(100 * 1e6);
        uint256 owed = pool.debt(borrower);

        _giveUSDC(borrower, owed + 1);
        vm.startPrank(borrower);
        usdc.approve(address(pool), owed + 1);
        vm.expectRevert("invalid amount");
        pool.repay(owed + 1);
        vm.stopPrank();
    }

    function test_repay_revertsZeroAmount() public {
        vm.prank(borrower);
        pool.borrow(100 * 1e6);

        vm.prank(borrower);
        vm.expectRevert("invalid amount");
        pool.repay(0);
    }

    function test_repay_emitsEvent() public {
        vm.prank(borrower);
        pool.borrow(1000 * 1e6);

        _giveUSDC(borrower, 500 * 1e6);
        vm.startPrank(borrower);
        usdc.approve(address(pool), 500 * 1e6);
        vm.expectEmit(true, false, false, true);
        emit CreditPool.Repaid(borrower, 500 * 1e6, 550 * 1e6);
        pool.repay(500 * 1e6);
        vm.stopPrank();
    }

    // =================================================================
    // Full lifecycle: LTV growth across repeated borrow/repay cycles
    // =================================================================

    function test_lifecycle_LTVstepsUpThenCapsAcrossCycles() public {
        uint256[6] memory expectedBps = [uint256(5000), 5500, 6000, 6500, 7000, 7000];

        for (uint256 i = 0; i < expectedBps.length; i++) {
            assertEq(pool.creditLimit(borrower), 6000 * 1e6 * expectedBps[i] / 10_000);

            vm.prank(borrower);
            pool.borrow(50 * 1e6);
            uint256 owed = pool.debt(borrower);

            _giveUSDC(borrower, owed);
            vm.startPrank(borrower);
            usdc.approve(address(pool), owed);
            pool.repay(owed);
            vm.stopPrank();
        }
    }

    // =================================================================
    // LP deposit / withdrawLP
    // =================================================================

    function test_deposit_increasesBalanceAndTotal() public {
        assertEq(pool.lpDeposits(lp), 10_000 * 1e6);
        assertEq(pool.totalLPDeposits(), 10_000 * 1e6);
    }

    function test_deposit_revertsZeroAmount() public {
        vm.prank(lp);
        vm.expectRevert("zero deposit");
        pool.deposit(0);
    }

    function test_deposit_multipleLPs_trackedIndependently() public {
        _seedLP(lp2, 5000 * 1e6);

        assertEq(pool.lpDeposits(lp), 10_000 * 1e6);
        assertEq(pool.lpDeposits(lp2), 5000 * 1e6);
        assertEq(pool.totalLPDeposits(), 15_000 * 1e6);
    }

    function test_withdrawLP_proRata_noInterestYet() public {
        vm.prank(lp);
        pool.withdrawLP(10_000 * 1e6);

        assertEq(usdc.balanceOf(lp), 10_000 * 1e6); // got back exactly what was deposited
        assertEq(pool.lpDeposits(lp), 0);
        assertEq(pool.totalLPDeposits(), 0);
    }

    function test_withdrawLP_proRata_withAccruedInterest() public {
        // Borrower pays interest into the pool, growing its tUSDC balance beyond
        // totalLPDeposits, so LPs should get more back than they put in.
        vm.prank(borrower);
        pool.borrow(1000 * 1e6);
        uint256 owed = pool.debt(borrower); // 1050e6

        _giveUSDC(borrower, owed);
        vm.startPrank(borrower);
        usdc.approve(address(pool), owed);
        pool.repay(owed);
        vm.stopPrank();

        // Pool now holds 10_000 (LP) - 1000 (lent out) + 1050 (repaid) = 10_050e6.
        assertEq(usdc.balanceOf(address(pool)), 10_050 * 1e6);

        vm.prank(lp);
        pool.withdrawLP(10_000 * 1e6); // the LP's entire share (100% of totalLPDeposits)

        assertEq(usdc.balanceOf(lp), 10_050 * 1e6); // full pool balance, including interest
    }

    function test_withdrawLP_partial_proRataAcrossTwoLPs() public {
        _seedLP(lp2, 10_000 * 1e6); // now 50/50 split, 20_000e6 total, no interest yet

        vm.prank(lp);
        pool.withdrawLP(5000 * 1e6); // half of lp's stake

        assertEq(usdc.balanceOf(lp), 5000 * 1e6);
        assertEq(pool.lpDeposits(lp), 5000 * 1e6);
        assertEq(pool.totalLPDeposits(), 15_000 * 1e6);
        // lp2 untouched
        assertEq(pool.lpDeposits(lp2), 10_000 * 1e6);
    }

    function test_withdrawLP_revertsAboveDeposited() public {
        vm.prank(lp);
        vm.expectRevert("invalid amount");
        pool.withdrawLP(10_000 * 1e6 + 1);
    }

    function test_withdrawLP_revertsZeroAmount() public {
        vm.prank(lp);
        vm.expectRevert("invalid amount");
        pool.withdrawLP(0);
    }

    function test_withdrawLP_emitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit CreditPool.WithdrawnLP(lp, 10_000 * 1e6);

        vm.prank(lp);
        pool.withdrawLP(10_000 * 1e6);
    }
}
