// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Test} from "forge-std/Test.sol";
import {PassportPool} from "../src/PassportPool.sol";
import {TestUSDC} from "../src/TestUSDC.sol";
import {FixedPriceOracle} from "../src/FixedPriceOracle.sol";
import {ICreditPassport} from "../src/interfaces/ICreditPassport.sol";

contract MockPassport is ICreditPassport {
    mapping(address => uint256) public scores;
    struct Report {
        address borrower;
        uint256 amount;
    }

    Report[] public reports;

    function setScore(address borrower, uint256 score) external {
        scores[borrower] = score;
    }

    function scoreOf(address borrower) external view returns (uint256) {
        return scores[borrower];
    }

    function recordLocalRepay(address borrower, uint256 amount) external {
        reports.push(Report(borrower, amount));
    }

    function reportCount() external view returns (uint256) {
        return reports.length;
    }
}

contract PassportPoolTest is Test {
    PassportPool pool;
    TestUSDC usdc;
    MockPassport passport;
    FixedPriceOracle oracle;

    address borrower = makeAddr("borrower");
    address lp = makeAddr("lp");
    address lp2 = makeAddr("lp2");

    uint256 constant PRICE_USD_PER_CTC = 1; // $1/tCTC keeps expected numbers simple

    function setUp() public {
        usdc = new TestUSDC();
        passport = new MockPassport();
        oracle = new FixedPriceOracle(PRICE_USD_PER_CTC * 1e8);
        pool = new PassportPool(address(usdc), address(passport), address(oracle));

        _seedLP(lp, 10_000 * 1e6);
        vm.deal(borrower, 1000 ether);
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

    function _depositCollateral(address who, uint256 amountWei) internal {
        vm.prank(who);
        pool.depositCollateral{value: amountWei}();
    }

    // =================================================================
    // Collateral + maxLtvBps
    // =================================================================

    function test_maxLtvBps_zeroScore_isBase() public view {
        assertEq(pool.maxLtvBps(borrower), 5000);
    }

    function test_maxLtvBps_scalesWithScore() public {
        passport.setScore(borrower, 100);
        assertEq(pool.maxLtvBps(borrower), 5000 + 100 * 10); // 6000
    }

    function test_maxLtvBps_capsAt250Points() public {
        passport.setScore(borrower, 1000);
        assertEq(pool.maxLtvBps(borrower), 7500); // capped, not 5000+10000
    }

    function test_maxLtvBps_neverReachesOneHundredPercent() public {
        passport.setScore(borrower, type(uint256).max);
        assertLt(pool.maxLtvBps(borrower), 10_000);
    }

    function test_collateralValue_convertsWeiToUsd() public {
        _depositCollateral(borrower, 1000 ether);
        assertEq(pool.collateralValue(borrower), 1000 * 1e6); // $1/tCTC, 1000 tCTC -> 1000 tUSDC-scale
    }

    function test_creditLimit_baseScore() public {
        _depositCollateral(borrower, 1000 ether);
        assertEq(pool.creditLimit(borrower), 1000 * 1e6 * 5000 / 10_000); // 500
    }

    function test_creditLimit_risesWithScore() public {
        _depositCollateral(borrower, 1000 ether);
        passport.setScore(borrower, 250);
        assertEq(pool.creditLimit(borrower), 1000 * 1e6 * 7500 / 10_000); // 750, capped
    }

    function testFuzz_creditLimit_neverExceedsCollateralValue(uint96 collateralWei, uint256 score) public {
        vm.assume(collateralWei > 0);
        vm.deal(borrower, collateralWei);
        _depositCollateral(borrower, collateralWei);
        passport.setScore(borrower, score);

        // Always over-collateralized. Not strictly-less: at dust collateral amounts the
        // USD conversion can round both sides down to 0 simultaneously.
        assertLe(pool.creditLimit(borrower), pool.collateralValue(borrower));
    }

    // =================================================================
    // withdrawCollateral
    // =================================================================

    function test_withdrawCollateral_succeedsWhenNoDebt() public {
        _depositCollateral(borrower, 1000 ether);
        vm.prank(borrower);
        pool.withdrawCollateral(1000 ether);
        assertEq(pool.collateralOf(borrower), 0);
    }

    function test_withdrawCollateral_revertsIfWouldBreachLTV() public {
        _depositCollateral(borrower, 1000 ether);
        vm.prank(borrower);
        pool.borrow(400 * 1e6); // debt = 420e6, limit at full collateral = 500e6

        vm.prank(borrower);
        vm.expectRevert("would breach LTV");
        pool.withdrawCollateral(1000 ether); // would zero out collateral while debt remains
    }

    function test_withdrawCollateral_partialAllowedIfStillHealthy() public {
        _depositCollateral(borrower, 1000 ether);
        vm.prank(borrower);
        pool.borrow(100 * 1e6); // debt = 105e6

        vm.prank(borrower);
        pool.withdrawCollateral(500 ether); // remaining 500 tCTC -> $500 value, limit 250e6 >= 105e6 debt
        assertEq(pool.collateralOf(borrower), 500 ether);
    }

    function test_withdrawCollateral_revertsAboveDeposited() public {
        _depositCollateral(borrower, 100 ether);
        vm.prank(borrower);
        vm.expectRevert("invalid amount");
        pool.withdrawCollateral(101 ether);
    }

    // =================================================================
    // borrow
    // =================================================================

    function test_borrow_withinLimit() public {
        _depositCollateral(borrower, 1000 ether);
        vm.prank(borrower);
        pool.borrow(400 * 1e6);
        assertEq(usdc.balanceOf(borrower), 400 * 1e6);
        assertEq(pool.debt(borrower), 420 * 1e6); // +5% flat interest
    }

    function test_borrow_exceedsLimit_reverts() public {
        _depositCollateral(borrower, 1000 ether);
        vm.prank(borrower);
        vm.expectRevert("exceeds credit limit");
        pool.borrow(490 * 1e6); // 490*1.05 > 500
    }

    function test_borrow_higherScoreUnlocksMoreCredit() public {
        _depositCollateral(borrower, 1000 ether);
        passport.setScore(borrower, 250); // 75% LTV -> limit 750e6

        vm.prank(borrower);
        pool.borrow(700 * 1e6); // would exceed base-LTV limit (500e6) but not boosted limit
        assertEq(pool.debt(borrower), 735 * 1e6);
    }

    function test_borrow_accumulatesPrincipalSinceLastReport() public {
        _depositCollateral(borrower, 1000 ether);
        vm.startPrank(borrower);
        pool.borrow(100 * 1e6);
        pool.borrow(100 * 1e6);
        vm.stopPrank();
        assertEq(pool.principalSinceLastReport(borrower), 200 * 1e6);
    }

    function test_borrow_emitsEvent() public {
        _depositCollateral(borrower, 1000 ether);
        vm.expectEmit(true, false, false, true);
        emit PassportPool.Borrowed(borrower, 100 * 1e6, 105 * 1e6);
        vm.prank(borrower);
        pool.borrow(100 * 1e6);
    }

    // =================================================================
    // repay + passport feedback loop
    // =================================================================

    function test_repay_partial_doesNotReportToPassport() public {
        _depositCollateral(borrower, 1000 ether);
        vm.prank(borrower);
        pool.borrow(100 * 1e6); // debt 105e6

        _giveUSDC(borrower, 50 * 1e6);
        vm.startPrank(borrower);
        usdc.approve(address(pool), 50 * 1e6);
        pool.repay(50 * 1e6);
        vm.stopPrank();

        assertEq(pool.debt(borrower), 55 * 1e6);
        assertEq(passport.reportCount(), 0);
    }

    function test_repay_fullAboveThreshold_reportsToPassport() public {
        _depositCollateral(borrower, 1000 ether);
        vm.prank(borrower);
        pool.borrow(100 * 1e6); // principal 100e6, well above MIN_CREDIT_LOAN (10e6)

        uint256 owed = pool.debt(borrower);
        _giveUSDC(borrower, owed);
        vm.startPrank(borrower);
        usdc.approve(address(pool), owed);
        pool.repay(owed);
        vm.stopPrank();

        assertEq(pool.debt(borrower), 0);
        assertEq(passport.reportCount(), 1);
        (address reportedBorrower, uint256 reportedAmount) = passport.reports(0);
        assertEq(reportedBorrower, borrower);
        assertEq(reportedAmount, 100 * 1e6);
        assertEq(pool.principalSinceLastReport(borrower), 0);
    }

    function test_repay_fullBelowThreshold_doesNotReport() public {
        _depositCollateral(borrower, 1000 ether);
        vm.prank(borrower);
        pool.borrow(5 * 1e6); // below MIN_CREDIT_LOAN (10e6)

        uint256 owed = pool.debt(borrower);
        _giveUSDC(borrower, owed);
        vm.startPrank(borrower);
        usdc.approve(address(pool), owed);
        pool.repay(owed);
        vm.stopPrank();

        assertEq(passport.reportCount(), 0);
        assertEq(pool.principalSinceLastReport(borrower), 5 * 1e6); // kept, not reset
    }

    function test_repay_accumulatesAcrossCyclesUntilThresholdCrossed() public {
        _depositCollateral(borrower, 1000 ether);

        // Cycle 1: borrow+repay 5e6, below threshold, no report.
        vm.prank(borrower);
        pool.borrow(5 * 1e6);
        uint256 owed1 = pool.debt(borrower);
        _giveUSDC(borrower, owed1);
        vm.startPrank(borrower);
        usdc.approve(address(pool), owed1);
        pool.repay(owed1);
        vm.stopPrank();
        assertEq(passport.reportCount(), 0);

        // Cycle 2: another 6e6 pushes cumulative principal to 11e6, crossing MIN_CREDIT_LOAN.
        vm.prank(borrower);
        pool.borrow(6 * 1e6);
        uint256 owed2 = pool.debt(borrower);
        _giveUSDC(borrower, owed2);
        vm.startPrank(borrower);
        usdc.approve(address(pool), owed2);
        pool.repay(owed2);
        vm.stopPrank();

        assertEq(passport.reportCount(), 1);
        (, uint256 reportedAmount) = passport.reports(0);
        assertEq(reportedAmount, 11 * 1e6);
    }

    function test_repay_revertsAboveDebt() public {
        _depositCollateral(borrower, 1000 ether);
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
        _depositCollateral(borrower, 1000 ether);
        vm.prank(borrower);
        pool.borrow(100 * 1e6);
        vm.prank(borrower);
        vm.expectRevert("invalid amount");
        pool.repay(0);
    }

    // =================================================================
    // LP deposit / withdrawLP (ported unchanged from the vesting-era pool)
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

    function test_withdrawLP_proRata_withAccruedInterest() public {
        vm.deal(borrower, 2200 ether);
        _depositCollateral(borrower, 2200 ether); // enough collateral to cover a 1000e6 loan + 5% interest at base 50% LTV
        vm.prank(borrower);
        pool.borrow(1000 * 1e6);
        uint256 owed = pool.debt(borrower); // 1050e6

        _giveUSDC(borrower, owed);
        vm.startPrank(borrower);
        usdc.approve(address(pool), owed);
        pool.repay(owed);
        vm.stopPrank();

        assertEq(usdc.balanceOf(address(pool)), 10_050 * 1e6);
        vm.prank(lp);
        pool.withdrawLP(10_000 * 1e6);
        assertEq(usdc.balanceOf(lp), 10_050 * 1e6);
    }

    function test_withdrawLP_partial_proRataAcrossTwoLPs() public {
        _seedLP(lp2, 10_000 * 1e6);
        vm.prank(lp);
        pool.withdrawLP(5000 * 1e6);
        assertEq(usdc.balanceOf(lp), 5000 * 1e6);
        assertEq(pool.totalLPDeposits(), 15_000 * 1e6);
    }

    function test_withdrawLP_revertsAboveDeposited() public {
        vm.prank(lp);
        vm.expectRevert("invalid amount");
        pool.withdrawLP(10_000 * 1e6 + 1);
    }
}
