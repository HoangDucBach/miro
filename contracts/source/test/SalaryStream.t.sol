// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Test} from "forge-std/Test.sol";
import {SalaryStream} from "../src/SalaryStream.sol";

/// @notice Recipient that reenters withdraw()/cancel() from its receive() hook, to confirm
///         the checks-effects-interactions ordering in SalaryStream prevents double-spend.
contract ReentrantRecipient {
    SalaryStream public stream;
    uint256 public streamId;
    enum Mode {
        None,
        Withdraw,
        Cancel
    }

    Mode public mode;
    bool public reentryReverted;
    bytes public reentryRevertReason;

    function arm(SalaryStream stream_, uint256 streamId_, Mode mode_) external {
        stream = stream_;
        streamId = streamId_;
        mode = mode_;
    }

    receive() external payable {
        if (mode == Mode.None) return;
        if (mode == Mode.Withdraw) {
            try stream.withdraw(streamId, 1) {
                reentryReverted = false;
            } catch (bytes memory reason) {
                reentryReverted = true;
                reentryRevertReason = reason;
            }
        } else if (mode == Mode.Cancel) {
            try stream.cancel(streamId) {
                reentryReverted = false;
            } catch (bytes memory reason) {
                reentryReverted = true;
                reentryRevertReason = reason;
            }
        }
    }
}

contract SalaryStreamTest is Test {
    SalaryStream stream;
    address employer = makeAddr("employer");
    address employee = makeAddr("employee");
    address stranger = makeAddr("stranger");

    uint256 constant SIX_MONTHS = 6 * 30 days;

    function setUp() public {
        stream = new SalaryStream();
        vm.deal(employer, 1000 ether);
    }

    // ---------------------------------------------------------------
    // createStream happy path
    // ---------------------------------------------------------------

    function test_createStream_setsFieldsCorrectly() public {
        vm.prank(employer);
        uint256 id = stream.createStream{value: 6 ether}(employee, block.timestamp + SIX_MONTHS);

        (
            address sender,
            address recipient,
            uint256 deposit,
            uint256 ratePerSecond,
            uint256 startTime,
            uint256 stopTime,
            uint256 withdrawn,
            bool cancelled
        ) = stream.streams(id);

        assertEq(sender, employer);
        assertEq(recipient, employee);
        assertEq(deposit, 6 ether);
        assertEq(ratePerSecond, 6 ether / SIX_MONTHS);
        assertEq(startTime, block.timestamp);
        assertEq(stopTime, block.timestamp + SIX_MONTHS);
        assertEq(withdrawn, 0);
        assertFalse(cancelled);
    }

    function test_createStream_incrementsStreamId() public {
        vm.startPrank(employer);
        uint256 id0 = stream.createStream{value: 1 ether}(employee, block.timestamp + 30 days);
        uint256 id1 = stream.createStream{value: 1 ether}(employee, block.timestamp + 30 days);
        vm.stopPrank();

        assertEq(id0, 0);
        assertEq(id1, 1);
        assertEq(stream.nextStreamId(), 2);
    }

    function test_createStream_emitsEvent() public {
        uint256 stopTime = block.timestamp + SIX_MONTHS;
        vm.expectEmit(true, true, true, true);
        emit SalaryStream.SalaryStreamCreated(
            0, employer, employee, 6 ether, 6 ether / SIX_MONTHS, block.timestamp, stopTime
        );

        vm.prank(employer);
        stream.createStream{value: 6 ether}(employee, stopTime);
    }

    // ---------------------------------------------------------------
    // createStream reverts
    // ---------------------------------------------------------------

    function test_createStream_revertsOnZeroDeposit() public {
        vm.prank(employer);
        vm.expectRevert("zero deposit");
        stream.createStream{value: 0}(employee, block.timestamp + SIX_MONTHS);
    }

    function test_createStream_revertsOnZeroAddressRecipient() public {
        vm.prank(employer);
        vm.expectRevert("invalid recipient");
        stream.createStream{value: 1 ether}(address(0), block.timestamp + SIX_MONTHS);
    }

    function test_createStream_revertsOnSelfRecipient() public {
        vm.prank(employer);
        vm.expectRevert("invalid recipient");
        stream.createStream{value: 1 ether}(employer, block.timestamp + SIX_MONTHS);
    }

    function test_createStream_revertsOnPastStopTime() public {
        vm.warp(1000);
        vm.prank(employer);
        vm.expectRevert("stopTime in past");
        stream.createStream{value: 1 ether}(employee, block.timestamp);
    }

    function test_createStream_revertsOnStopTimeBeforeNow() public {
        vm.warp(1000);
        vm.prank(employer);
        vm.expectRevert("stopTime in past");
        stream.createStream{value: 1 ether}(employee, block.timestamp - 1);
    }

    function test_createStream_revertsWhenDepositTooSmallForDuration() public {
        // 1 wei over a 2-second duration truncates ratePerSecond to 0.
        vm.prank(employer);
        vm.expectRevert("deposit too small for duration");
        stream.createStream{value: 1}(employee, block.timestamp + 2);
    }

    // ---------------------------------------------------------------
    // balanceOf vesting math
    // ---------------------------------------------------------------

    function test_balanceOf_zeroAtStart() public {
        vm.prank(employer);
        uint256 id = stream.createStream{value: 6 ether}(employee, block.timestamp + SIX_MONTHS);
        assertEq(stream.balanceOf(id), 0);
    }

    function test_balanceOf_accruesLinearly() public {
        vm.prank(employer);
        uint256 id = stream.createStream{value: 6 ether}(employee, block.timestamp + SIX_MONTHS);

        vm.warp(block.timestamp + 30 days);
        assertApproxEqRel(stream.balanceOf(id), 1 ether, 0.01e18);

        vm.warp(block.timestamp + 60 days); // 90 days total = half the stream
        assertApproxEqRel(stream.balanceOf(id), 3 ether, 0.01e18);
    }

    function test_balanceOf_capsAtStopTime_andReflectsTruncation() public {
        vm.prank(employer);
        uint256 id = stream.createStream{value: 6 ether}(employee, block.timestamp + SIX_MONTHS);

        vm.warp(block.timestamp + SIX_MONTHS + 365 days); // long past stopTime
        (,,, uint256 ratePerSecond,,,,) = stream.streams(id);

        // Balance never exceeds ratePerSecond * duration, which rounds down from deposit.
        assertEq(stream.balanceOf(id), ratePerSecond * SIX_MONTHS);
        assertLe(stream.balanceOf(id), 6 ether);
    }

    function test_balanceOf_subtractsWithdrawn() public {
        vm.prank(employer);
        uint256 id = stream.createStream{value: 6 ether}(employee, block.timestamp + SIX_MONTHS);
        vm.warp(block.timestamp + 30 days);

        uint256 vested = stream.balanceOf(id);
        vm.prank(employee);
        stream.withdraw(id, vested / 2);

        assertEq(stream.balanceOf(id), vested - vested / 2);
    }

    function test_balanceOf_afterCancelled_returnsZero() public {
        vm.prank(employer);
        uint256 id = stream.createStream{value: 6 ether}(employee, block.timestamp + SIX_MONTHS);
        vm.warp(block.timestamp + 30 days);

        vm.prank(employer);
        stream.cancel(id);

        assertEq(stream.balanceOf(id), 0);
    }

    // ---------------------------------------------------------------
    // withdraw
    // ---------------------------------------------------------------

    function test_withdraw_partialAmount_succeeds() public {
        vm.prank(employer);
        uint256 id = stream.createStream{value: 6 ether}(employee, block.timestamp + SIX_MONTHS);
        vm.warp(block.timestamp + 30 days);

        uint256 before = employee.balance;
        vm.prank(employee);
        stream.withdraw(id, 0.5 ether);

        assertEq(employee.balance, before + 0.5 ether);
        (,,,,,, uint256 withdrawn,) = stream.streams(id);
        assertEq(withdrawn, 0.5 ether);
    }

    function test_withdraw_exactVestedAmount_succeeds() public {
        vm.prank(employer);
        uint256 id = stream.createStream{value: 6 ether}(employee, block.timestamp + SIX_MONTHS);
        vm.warp(block.timestamp + 30 days);

        uint256 vested = stream.balanceOf(id);
        vm.prank(employee);
        stream.withdraw(id, vested); // boundary: amount == balanceOf exactly

        assertEq(stream.balanceOf(id), 0);
    }

    function test_withdraw_revertsAboveVested() public {
        vm.prank(employer);
        uint256 id = stream.createStream{value: 6 ether}(employee, block.timestamp + SIX_MONTHS);

        vm.prank(employee);
        vm.expectRevert("amount exceeds vested balance");
        stream.withdraw(id, 1 ether);
    }

    function test_withdraw_revertsZeroAmount() public {
        vm.prank(employer);
        uint256 id = stream.createStream{value: 6 ether}(employee, block.timestamp + SIX_MONTHS);
        vm.warp(block.timestamp + 30 days);

        vm.prank(employee);
        vm.expectRevert("amount exceeds vested balance");
        stream.withdraw(id, 0);
    }

    function test_withdraw_revertsIfNotRecipient() public {
        vm.prank(employer);
        uint256 id = stream.createStream{value: 6 ether}(employee, block.timestamp + SIX_MONTHS);
        vm.warp(block.timestamp + 30 days);

        vm.prank(employer);
        vm.expectRevert("not recipient");
        stream.withdraw(id, 0.1 ether);

        vm.prank(stranger);
        vm.expectRevert("not recipient");
        stream.withdraw(id, 0.1 ether);
    }

    function test_withdraw_revertsIfCancelled() public {
        vm.prank(employer);
        uint256 id = stream.createStream{value: 6 ether}(employee, block.timestamp + SIX_MONTHS);
        vm.warp(block.timestamp + 30 days);

        vm.prank(employer);
        stream.cancel(id);

        vm.prank(employee);
        vm.expectRevert("cancelled");
        stream.withdraw(id, 0.01 ether);
    }

    function test_withdraw_multipleWithdrawalsAccumulate() public {
        vm.prank(employer);
        uint256 id = stream.createStream{value: 6 ether}(employee, block.timestamp + SIX_MONTHS);

        vm.warp(block.timestamp + 30 days);
        vm.prank(employee);
        stream.withdraw(id, 0.3 ether);

        vm.warp(block.timestamp + 30 days);
        vm.prank(employee);
        stream.withdraw(id, 0.3 ether);

        (,,,,,, uint256 withdrawn,) = stream.streams(id);
        assertEq(withdrawn, 0.6 ether);
    }

    function test_withdraw_paysRecipient() public {
        vm.prank(employer);
        uint256 id = stream.createStream{value: 6 ether}(employee, block.timestamp + SIX_MONTHS);
        vm.warp(block.timestamp + 30 days);

        uint256 before = employee.balance;
        vm.prank(employee);
        stream.withdraw(id, 0.5 ether);
        assertEq(employee.balance, before + 0.5 ether);
    }

    function test_withdraw_emitsEvent() public {
        vm.prank(employer);
        uint256 id = stream.createStream{value: 6 ether}(employee, block.timestamp + SIX_MONTHS);
        vm.warp(block.timestamp + 30 days);

        vm.expectEmit(true, true, false, true);
        emit SalaryStream.SalaryStreamWithdrawn(id, employee, 0.5 ether);

        vm.prank(employee);
        stream.withdraw(id, 0.5 ether);
    }

    function test_withdraw_afterFullVesting_matchesTruncatedTotal() public {
        vm.prank(employer);
        uint256 id = stream.createStream{value: 6 ether}(employee, block.timestamp + SIX_MONTHS);
        vm.warp(block.timestamp + SIX_MONTHS);

        (,,, uint256 ratePerSecond,,,,) = stream.streams(id);
        uint256 fullyVested = ratePerSecond * SIX_MONTHS;

        vm.prank(employee);
        stream.withdraw(id, fullyVested);

        assertEq(employee.balance, fullyVested);
        assertEq(stream.balanceOf(id), 0);
        // Dust from truncation (deposit - fullyVested) stays stranded in the contract.
        assertEq(address(stream).balance, 6 ether - fullyVested);
    }

    // ---------------------------------------------------------------
    // cancel
    // ---------------------------------------------------------------

    function test_cancel_bySender_succeeds() public {
        vm.prank(employer);
        uint256 id = stream.createStream{value: 6 ether}(employee, block.timestamp + SIX_MONTHS);

        vm.prank(employer);
        stream.cancel(id);

        (,,,,,,, bool cancelled) = stream.streams(id);
        assertTrue(cancelled);
    }

    function test_cancel_byRecipient_succeeds() public {
        vm.prank(employer);
        uint256 id = stream.createStream{value: 6 ether}(employee, block.timestamp + SIX_MONTHS);

        vm.prank(employee);
        stream.cancel(id);

        (,,,,,,, bool cancelled) = stream.streams(id);
        assertTrue(cancelled);
    }

    function test_cancel_byStranger_reverts() public {
        vm.prank(employer);
        uint256 id = stream.createStream{value: 6 ether}(employee, block.timestamp + SIX_MONTHS);

        vm.prank(stranger);
        vm.expectRevert("not a party");
        stream.cancel(id);
    }

    function test_cancel_immediatelyAfterCreation_refundsSenderFully() public {
        vm.prank(employer);
        uint256 id = stream.createStream{value: 6 ether}(employee, block.timestamp + SIX_MONTHS);

        uint256 employerBefore = employer.balance;
        uint256 employeeBefore = employee.balance;

        vm.prank(employer);
        stream.cancel(id);

        assertEq(employee.balance, employeeBefore); // nothing vested yet
        assertEq(employer.balance, employerBefore + 6 ether);
    }

    function test_cancel_beforeAnyWithdrawal_splitsVestedVsRemainder() public {
        vm.prank(employer);
        uint256 id = stream.createStream{value: 6 ether}(employee, block.timestamp + SIX_MONTHS);
        vm.warp(block.timestamp + 30 days);

        uint256 expectedPayout = stream.balanceOf(id);
        (,,, uint256 ratePerSecond,,,,) = stream.streams(id);
        uint256 expectedRefund = 6 ether - ratePerSecond * 30 days;

        uint256 employeeBefore = employee.balance;
        uint256 employerBefore = employer.balance;

        vm.prank(employer);
        stream.cancel(id);

        assertEq(employee.balance, employeeBefore + expectedPayout);
        assertEq(employer.balance, employerBefore + expectedRefund);
    }

    function test_cancel_afterPartialWithdrawal_paysOnlyRemainingVested() public {
        vm.prank(employer);
        uint256 id = stream.createStream{value: 6 ether}(employee, block.timestamp + SIX_MONTHS);
        vm.warp(block.timestamp + 30 days);

        vm.prank(employee);
        stream.withdraw(id, 0.5 ether);

        vm.warp(block.timestamp + 30 days);
        uint256 remainingVested = stream.balanceOf(id); // vested-so-far minus the 0.5 already paid

        uint256 employeeBefore = employee.balance;
        vm.prank(employee);
        stream.cancel(id);

        assertEq(employee.balance, employeeBefore + remainingVested);
    }

    function test_cancel_atFullVesting_paysTruncatedTotalMinusWithdrawn() public {
        vm.prank(employer);
        uint256 id = stream.createStream{value: 6 ether}(employee, block.timestamp + SIX_MONTHS);
        vm.warp(block.timestamp + SIX_MONTHS);

        (,,, uint256 ratePerSecond,,,,) = stream.streams(id);
        uint256 fullyVested = ratePerSecond * SIX_MONTHS;

        uint256 employeeBefore = employee.balance;
        uint256 employerBefore = employer.balance;

        vm.prank(employer);
        stream.cancel(id);

        assertEq(employee.balance, employeeBefore + fullyVested);
        // Sender gets back deposit - fullyVested (the truncation dust), not zero.
        assertEq(employer.balance, employerBefore + (6 ether - fullyVested));
    }

    function test_cancel_alreadyCancelled_reverts() public {
        vm.prank(employer);
        uint256 id = stream.createStream{value: 6 ether}(employee, block.timestamp + SIX_MONTHS);

        vm.prank(employer);
        stream.cancel(id);

        vm.prank(employer);
        vm.expectRevert("already cancelled");
        stream.cancel(id);
    }

    function test_cancel_emitsEvent() public {
        vm.prank(employer);
        uint256 id = stream.createStream{value: 6 ether}(employee, block.timestamp + SIX_MONTHS);
        vm.warp(block.timestamp + 30 days);

        uint256 expectedPayout = stream.balanceOf(id);
        uint256 expectedRefund = 6 ether - expectedPayout;

        vm.expectEmit(true, false, false, true);
        emit SalaryStream.SalaryStreamCancelled(id, expectedRefund, expectedPayout);

        vm.prank(employer);
        stream.cancel(id);
    }

    function test_cancel_conservesFunds_noValueCreatedOrDestroyed() public {
        vm.prank(employer);
        uint256 id = stream.createStream{value: 6 ether}(employee, block.timestamp + SIX_MONTHS);
        vm.warp(block.timestamp + 45 days);

        vm.prank(employee);
        stream.withdraw(id, 0.2 ether);

        uint256 contractBalanceBefore = address(stream).balance;
        (,,,,,, uint256 withdrawnBefore,) = stream.streams(id);

        vm.prank(employer);
        stream.cancel(id);

        // recipientPayout + senderRefund must exactly drain (deposit - withdrawnBefore)
        // from the contract for this stream.
        assertEq(address(stream).balance, contractBalanceBefore - (6 ether - withdrawnBefore));
    }

    // ---------------------------------------------------------------
    // Reentrancy safety
    // ---------------------------------------------------------------

    function test_withdraw_reentrancy_cannotDoubleSpend() public {
        ReentrantRecipient attacker = new ReentrantRecipient();

        vm.prank(employer);
        uint256 id = stream.createStream{value: 6 ether}(employee, block.timestamp + SIX_MONTHS);
        // Redirect this stream to the attacker by creating a fresh stream to it instead
        // (recipient is fixed at creation), so create directly for the attacker:
        vm.prank(employer);
        uint256 attackerStreamId = stream.createStream{value: 6 ether}(address(attacker), block.timestamp + SIX_MONTHS);
        id; // unused sibling stream, kept only to prove multi-stream isolation elsewhere

        vm.warp(block.timestamp + 30 days);
        uint256 vested = stream.balanceOf(attackerStreamId);
        attacker.arm(stream, attackerStreamId, ReentrantRecipient.Mode.Withdraw);

        vm.prank(address(attacker));
        stream.withdraw(attackerStreamId, vested); // withdraws everything vested

        // The reentrant call (attempting to withdraw again inside receive()) must have
        // reverted, because `withdrawn` was already updated before the external call.
        assertTrue(attacker.reentryReverted());
        assertEq(stream.balanceOf(attackerStreamId), 0);
        assertEq(address(attacker).balance, vested); // no double-spend
    }

    function test_cancel_reentrancy_cannotDoubleSpend() public {
        ReentrantRecipient attacker = new ReentrantRecipient();

        vm.prank(employer);
        uint256 id = stream.createStream{value: 6 ether}(address(attacker), block.timestamp + SIX_MONTHS);

        vm.warp(block.timestamp + 30 days);
        attacker.arm(stream, id, ReentrantRecipient.Mode.Cancel);

        vm.prank(employer);
        stream.cancel(id);

        // Reentrant cancel() must revert with "already cancelled" since `cancelled` was
        // set to true before the payout transfer.
        assertTrue(attacker.reentryReverted());
        (,,,,,,, bool cancelled) = stream.streams(id);
        assertTrue(cancelled);
    }

    // ---------------------------------------------------------------
    // Multi-stream isolation
    // ---------------------------------------------------------------

    function test_multipleStreams_areIndependent() public {
        vm.startPrank(employer);
        uint256 id0 = stream.createStream{value: 1 ether}(employee, block.timestamp + 30 days);
        uint256 id1 = stream.createStream{value: 2 ether}(stranger, block.timestamp + 60 days);
        vm.stopPrank();

        vm.warp(block.timestamp + 30 days);

        uint256 vested0 = stream.balanceOf(id0); // evaluate before pranking, vm.prank is single-shot
        vm.prank(employee);
        stream.withdraw(id0, vested0);

        // id1's balance and withdrawn state must be unaffected by id0's withdrawal.
        (,,,,,, uint256 withdrawn1,) = stream.streams(id1);
        assertEq(withdrawn1, 0);
        assertGt(stream.balanceOf(id1), 0);
    }

    // ---------------------------------------------------------------
    // Fuzz invariants
    // ---------------------------------------------------------------

    function testFuzz_ratePerSecond_neverOverstatesDeposit(uint96 deposit, uint32 durationSeconds) public {
        vm.assume(durationSeconds > 0);
        vm.assume(deposit / uint256(durationSeconds) > 0); // avoid "deposit too small for duration"
        vm.deal(employer, uint256(deposit));

        vm.prank(employer);
        uint256 id = stream.createStream{value: deposit}(employee, block.timestamp + durationSeconds);

        (,,, uint256 ratePerSecond,,,,) = stream.streams(id);
        assertLe(ratePerSecond * durationSeconds, deposit);
    }

    function testFuzz_balanceOf_neverExceedsDeposit(uint96 deposit, uint32 durationSeconds, uint32 warpSeconds)
        public
    {
        vm.assume(durationSeconds > 0);
        vm.assume(deposit / uint256(durationSeconds) > 0);
        vm.deal(employer, uint256(deposit));

        vm.prank(employer);
        uint256 id = stream.createStream{value: deposit}(employee, block.timestamp + durationSeconds);

        vm.warp(block.timestamp + warpSeconds);
        assertLe(stream.balanceOf(id), deposit);
    }

    function testFuzz_cancel_conservesRemainingValue(
        uint96 deposit,
        uint32 durationSeconds,
        uint32 warpSeconds,
        uint96 withdrawAmountSeed
    ) public {
        vm.assume(durationSeconds > 10);
        vm.assume(deposit / uint256(durationSeconds) > 0);
        vm.deal(employer, uint256(deposit));

        vm.prank(employer);
        uint256 id = stream.createStream{value: deposit}(employee, block.timestamp + durationSeconds);

        vm.warp(block.timestamp + (warpSeconds % durationSeconds));
        uint256 vested = stream.balanceOf(id);
        if (vested > 0) {
            uint256 withdrawAmount = withdrawAmountSeed % (vested + 1);
            if (withdrawAmount > 0) {
                vm.prank(employee);
                stream.withdraw(id, withdrawAmount);
            }
        }

        (,,,,,, uint256 withdrawnBefore,) = stream.streams(id);
        uint256 contractBalanceBefore = address(stream).balance;

        vm.prank(employer);
        stream.cancel(id);

        assertEq(address(stream).balance, contractBalanceBefore - (deposit - withdrawnBefore));
    }
}
