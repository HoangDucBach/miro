// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Test} from "forge-std/Test.sol";
import {EmployerRegistry} from "../src/EmployerRegistry.sol";

contract ReentrantDeregisterer {
    EmployerRegistry public registry;
    bool public reentryReverted;

    function arm(EmployerRegistry registry_) external {
        registry = registry_;
    }

    function register() external payable {
        registry.register{value: msg.value}();
    }

    receive() external payable {
        try registry.deregister() {
            reentryReverted = false;
        } catch {
            reentryReverted = true;
        }
    }
}

contract RegistryTest is Test {
    EmployerRegistry registry;
    address employer = makeAddr("employer");
    address employer2 = makeAddr("employer2");
    address stranger = makeAddr("stranger");

    function setUp() public {
        registry = new EmployerRegistry();
        vm.deal(employer, 500 ether);
        vm.deal(employer2, 500 ether);
    }

    // =================================================================
    // register
    // =================================================================

    function test_register_belowMinStake_reverts() public {
        vm.prank(employer);
        vm.expectRevert("stake below minimum");
        registry.register{value: 50 ether}();
    }

    function test_register_zeroStake_reverts() public {
        vm.prank(employer);
        vm.expectRevert("stake below minimum");
        registry.register{value: 0}();
    }

    function test_register_atExactlyMinStake_succeeds() public {
        vm.prank(employer);
        registry.register{value: 100 ether}();
        assertTrue(registry.isVerified(employer));
        assertEq(registry.stakeOf(employer), 100 ether);
    }

    function test_register_aboveMinStake_succeeds() public {
        vm.prank(employer);
        registry.register{value: 250 ether}();
        assertTrue(registry.isVerified(employer));
        assertEq(registry.stakeOf(employer), 250 ether);
    }

    function test_register_thenVerified() public {
        vm.prank(employer);
        registry.register{value: 100 ether}();
        assertTrue(registry.isVerified(employer));
    }

    function test_register_doubleRegister_reverts() public {
        vm.startPrank(employer);
        registry.register{value: 100 ether}();
        vm.expectRevert("already registered");
        registry.register{value: 100 ether}();
        vm.stopPrank();
    }

    function test_register_doubleRegister_revertsEvenWithHigherSecondStake() public {
        vm.startPrank(employer);
        registry.register{value: 100 ether}();
        vm.expectRevert("already registered");
        registry.register{value: 200 ether}(); // can't top up by re-registering
        vm.stopPrank();
    }

    function test_register_multipleEmployers_trackedIndependently() public {
        vm.prank(employer);
        registry.register{value: 100 ether}();
        vm.prank(employer2);
        registry.register{value: 150 ether}();

        assertEq(registry.stakeOf(employer), 100 ether);
        assertEq(registry.stakeOf(employer2), 150 ether);
        assertTrue(registry.isVerified(employer));
        assertTrue(registry.isVerified(employer2));
    }

    function test_register_emitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit EmployerRegistry.Registered(employer, 100 ether);

        vm.prank(employer);
        registry.register{value: 100 ether}();
    }

    // =================================================================
    // isVerified
    // =================================================================

    function test_isVerified_falseForUnregisteredAddress() public view {
        assertFalse(registry.isVerified(stranger));
    }

    function test_isVerified_falseForZeroAddress() public view {
        assertFalse(registry.isVerified(address(0)));
    }

    // =================================================================
    // deregister
    // =================================================================

    function test_deregister_refundsStake() public {
        vm.startPrank(employer);
        registry.register{value: 100 ether}();
        uint256 before = employer.balance;
        registry.deregister();
        vm.stopPrank();

        assertEq(employer.balance, before + 100 ether);
        assertFalse(registry.isVerified(employer));
    }

    function test_deregister_zeroesOutStake() public {
        vm.startPrank(employer);
        registry.register{value: 100 ether}();
        registry.deregister();
        vm.stopPrank();

        assertEq(registry.stakeOf(employer), 0);
    }

    function test_deregister_notRegistered_reverts() public {
        vm.prank(stranger);
        vm.expectRevert("not registered");
        registry.deregister();
    }

    function test_deregister_twice_reverts() public {
        vm.startPrank(employer);
        registry.register{value: 100 ether}();
        registry.deregister();
        vm.expectRevert("not registered");
        registry.deregister();
        vm.stopPrank();
    }

    function test_deregister_thenReregister_succeeds() public {
        vm.startPrank(employer);
        registry.register{value: 100 ether}();
        registry.deregister();
        registry.register{value: 120 ether}(); // fresh registration works again
        vm.stopPrank();

        assertTrue(registry.isVerified(employer));
        assertEq(registry.stakeOf(employer), 120 ether);
    }

    function test_deregister_emitsEvent() public {
        vm.startPrank(employer);
        registry.register{value: 100 ether}();
        vm.expectEmit(true, false, false, true);
        emit EmployerRegistry.Deregistered(employer, 100 ether);
        registry.deregister();
        vm.stopPrank();
    }

    function test_deregister_doesNotAffectOtherEmployers() public {
        vm.prank(employer);
        registry.register{value: 100 ether}();
        vm.prank(employer2);
        registry.register{value: 150 ether}();

        vm.prank(employer);
        registry.deregister();

        assertFalse(registry.isVerified(employer));
        assertTrue(registry.isVerified(employer2));
        assertEq(registry.stakeOf(employer2), 150 ether);
    }

    function test_deregister_reentrancy_cannotDoubleWithdraw() public {
        ReentrantDeregisterer attacker = new ReentrantDeregisterer();
        attacker.arm(registry);
        // Fund only via the call's value — dealing ETH separately would leave attacker
        // holding leftover balance never spent on the stake, muddying the assertion below.
        attacker.register{value: 100 ether}();

        uint256 registryBalanceBefore = address(registry).balance;

        vm.prank(address(attacker));
        registry.deregister();

        // The reentrant deregister() call (from the attacker's receive()) must have
        // reverted, since stakeOf was zeroed before the refund transfer.
        assertTrue(attacker.reentryReverted());
        assertEq(address(registry).balance, registryBalanceBefore - 100 ether);
        assertEq(address(attacker).balance, 100 ether);
    }

    // =================================================================
    // Fuzz
    // =================================================================

    function testFuzz_register_isVerifiedIffStakeAtLeastMin(uint256 stakeAmount) public {
        stakeAmount = bound(stakeAmount, 0, 1000 ether);
        vm.deal(employer, stakeAmount);
        uint256 minStake = registry.MIN_STAKE(); // read before pranking — vm.prank is single-shot

        vm.prank(employer);
        if (stakeAmount < minStake) {
            vm.expectRevert("stake below minimum");
            registry.register{value: stakeAmount}();
        } else {
            registry.register{value: stakeAmount}();
            assertTrue(registry.isVerified(employer));
        }
    }
}
