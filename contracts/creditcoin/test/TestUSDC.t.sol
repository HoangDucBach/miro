// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {TestUSDC} from "../src/TestUSDC.sol";

contract TestUSDCTest is Test {
    TestUSDC usdc;
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address spender = makeAddr("spender");

    function setUp() public {
        usdc = new TestUSDC();
    }

    // =================================================================
    // faucet
    // =================================================================

    function test_faucet_firstClaimSucceedsAtDefaultLowTimestamp() public {
        // Regression test: forge's default block.timestamp is 1, which is less than
        // FAUCET_COOLDOWN (1 days) — the very first claim must not be blocked by that.
        assertEq(block.timestamp, 1);

        vm.prank(alice);
        usdc.faucet();

        assertEq(usdc.balanceOf(alice), usdc.FAUCET_AMOUNT());
    }

    function test_faucet_mintsCorrectAmount() public {
        vm.prank(alice);
        usdc.faucet();
        assertEq(usdc.balanceOf(alice), 10_000 * 1e6);
        assertEq(usdc.totalSupply(), 10_000 * 1e6);
    }

    function test_faucet_secondClaimBeforeCooldown_reverts() public {
        vm.startPrank(alice);
        usdc.faucet();
        vm.expectRevert("faucet on cooldown");
        usdc.faucet();
        vm.stopPrank();
    }

    function test_faucet_secondClaimJustBeforeCooldownExpires_reverts() public {
        vm.startPrank(alice);
        usdc.faucet();
        vm.warp(block.timestamp + usdc.FAUCET_COOLDOWN() - 1);
        vm.expectRevert("faucet on cooldown");
        usdc.faucet();
        vm.stopPrank();
    }

    function test_faucet_secondClaimAtExactCooldownBoundary_succeeds() public {
        vm.startPrank(alice);
        usdc.faucet();
        vm.warp(block.timestamp + usdc.FAUCET_COOLDOWN());
        usdc.faucet(); // must not revert at the exact boundary
        vm.stopPrank();

        assertEq(usdc.balanceOf(alice), 20_000 * 1e6);
    }

    function test_faucet_afterCooldown_accumulatesBalance() public {
        vm.startPrank(alice);
        usdc.faucet();
        vm.warp(block.timestamp + 1 days + 1);
        usdc.faucet();
        vm.stopPrank();

        assertEq(usdc.balanceOf(alice), 20_000 * 1e6);
    }

    function test_faucet_independentCooldownsPerUser() public {
        vm.prank(alice);
        usdc.faucet();

        // bob's first claim must succeed even though alice just claimed.
        vm.prank(bob);
        usdc.faucet();

        assertEq(usdc.balanceOf(alice), 10_000 * 1e6);
        assertEq(usdc.balanceOf(bob), 10_000 * 1e6);
    }

    function test_faucet_emitsTransferEventFromZeroAddress() public {
        vm.expectEmit(true, true, false, true);
        emit IERC20.Transfer(address(0), alice, 10_000 * 1e6);

        vm.prank(alice);
        usdc.faucet();
    }

    // =================================================================
    // transfer
    // =================================================================

    function test_transfer_movesBalance() public {
        vm.prank(alice);
        usdc.faucet();

        vm.prank(alice);
        usdc.transfer(bob, 100 * 1e6);

        assertEq(usdc.balanceOf(alice), 9900 * 1e6);
        assertEq(usdc.balanceOf(bob), 100 * 1e6);
    }

    function test_transfer_revertsOnInsufficientBalance() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, alice, 0, 1));
        usdc.transfer(bob, 1);
    }

    function test_transfer_zeroAmount_succeedsAsNoOp() public {
        vm.prank(alice);
        usdc.faucet();

        vm.prank(alice);
        bool ok = usdc.transfer(bob, 0);

        assertTrue(ok);
        assertEq(usdc.balanceOf(bob), 0);
    }

    function test_transfer_toSelf_leavesBalanceUnchanged() public {
        vm.prank(alice);
        usdc.faucet();

        vm.prank(alice);
        usdc.transfer(alice, 500 * 1e6);

        assertEq(usdc.balanceOf(alice), 10_000 * 1e6);
    }

    function test_transfer_emitsEvent() public {
        vm.prank(alice);
        usdc.faucet();

        vm.expectEmit(true, true, false, true);
        emit IERC20.Transfer(alice, bob, 100 * 1e6);

        vm.prank(alice);
        usdc.transfer(bob, 100 * 1e6);
    }

    function test_transfer_conservesTotalSupply() public {
        vm.prank(alice);
        usdc.faucet();
        uint256 supplyBefore = usdc.totalSupply();

        vm.prank(alice);
        usdc.transfer(bob, 3000 * 1e6);

        assertEq(usdc.totalSupply(), supplyBefore);
        assertEq(usdc.balanceOf(alice) + usdc.balanceOf(bob), supplyBefore);
    }

    // =================================================================
    // approve / transferFrom
    // =================================================================

    function test_approve_setsAllowance() public {
        vm.prank(alice);
        usdc.approve(spender, 500 * 1e6);
        assertEq(usdc.allowance(alice, spender), 500 * 1e6);
    }

    function test_approve_overwritesPreviousAllowance() public {
        vm.startPrank(alice);
        usdc.approve(spender, 500 * 1e6);
        usdc.approve(spender, 200 * 1e6);
        vm.stopPrank();

        assertEq(usdc.allowance(alice, spender), 200 * 1e6);
    }

    function test_approve_emitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit IERC20.Approval(alice, spender, 500 * 1e6);

        vm.prank(alice);
        usdc.approve(spender, 500 * 1e6);
    }

    function test_transferFrom_withinAllowance_succeeds() public {
        vm.prank(alice);
        usdc.faucet();
        vm.prank(alice);
        usdc.approve(spender, 500 * 1e6);

        vm.prank(spender);
        usdc.transferFrom(alice, bob, 300 * 1e6);

        assertEq(usdc.balanceOf(bob), 300 * 1e6);
        assertEq(usdc.allowance(alice, spender), 200 * 1e6);
    }

    function test_transferFrom_exceedsAllowance_reverts() public {
        vm.prank(alice);
        usdc.faucet();
        vm.prank(alice);
        usdc.approve(spender, 100 * 1e6);

        vm.prank(spender);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, spender, 100 * 1e6, 101 * 1e6)
        );
        usdc.transferFrom(alice, bob, 101 * 1e6);
    }

    function test_transferFrom_exceedsBalanceDespiteAllowance_reverts() public {
        vm.prank(alice);
        usdc.approve(spender, 1000 * 1e6); // allowance granted but alice has zero balance

        vm.prank(spender);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, alice, 0, 100 * 1e6));
        usdc.transferFrom(alice, bob, 100 * 1e6);
    }

    function test_transferFrom_infiniteAllowance_doesNotDecrement() public {
        vm.prank(alice);
        usdc.faucet();
        vm.prank(alice);
        usdc.approve(spender, type(uint256).max);

        vm.prank(spender);
        usdc.transferFrom(alice, bob, 1000 * 1e6);

        assertEq(usdc.allowance(alice, spender), type(uint256).max);
    }

    function test_transferFrom_exactAllowance_zeroesItOut() public {
        vm.prank(alice);
        usdc.faucet();
        vm.prank(alice);
        usdc.approve(spender, 100 * 1e6);

        vm.prank(spender);
        usdc.transferFrom(alice, bob, 100 * 1e6);

        assertEq(usdc.allowance(alice, spender), 0);
    }

    function test_transferFrom_withoutApproval_reverts() public {
        vm.prank(alice);
        usdc.faucet();

        vm.prank(spender);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, spender, 0, 1));
        usdc.transferFrom(alice, bob, 1);
    }

    // =================================================================
    // Fuzz
    // =================================================================

    function testFuzz_transfer_neverExceedsBalance(uint96 faucetClaims, uint256 transferAmountSeed) public {
        uint256 claims = bound(faucetClaims, 1, 5);
        vm.startPrank(alice);
        for (uint256 i = 0; i < claims; i++) {
            usdc.faucet();
            vm.warp(block.timestamp + 1 days + 1);
        }
        uint256 balance = usdc.balanceOf(alice);
        uint256 amount = transferAmountSeed % (balance + 1);
        usdc.transfer(bob, amount);
        vm.stopPrank();

        assertEq(usdc.balanceOf(alice), balance - amount);
        assertEq(usdc.balanceOf(bob), amount);
    }
}
