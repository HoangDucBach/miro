// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {FixedMorphoOracle} from "../src/FixedMorphoOracle.sol";

contract FixedMorphoOracleTest is Test {
    FixedMorphoOracle oracle;
    address alice = makeAddr("alice");

    // Both assets 18-decimal: precision = 36 + 18 - 18 = 36. 1e36 means 1:1 price.
    uint256 constant ONE_TO_ONE = 1e36;

    function setUp() public {
        oracle = new FixedMorphoOracle(18, 18, ONE_TO_ONE);
    }

    function test_constructor_setsInitialPrice() public view {
        assertEq(oracle.price(), ONE_TO_ONE);
        assertEq(oracle.loanDecimals(), 18);
        assertEq(oracle.collateralDecimals(), 18);
    }

    function test_constructor_revertsOnZeroPrice() public {
        vm.expectRevert("price must be positive");
        new FixedMorphoOracle(18, 18, 0);
    }

    function test_setPrice_byOwner_succeeds() public {
        oracle.setPrice(2 * ONE_TO_ONE);
        assertEq(oracle.price(), 2 * ONE_TO_ONE);
    }

    function test_setPrice_byNonOwner_reverts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        oracle.setPrice(2 * ONE_TO_ONE);
    }

    function test_setPrice_zero_reverts() public {
        vm.expectRevert("price must be positive");
        oracle.setPrice(0);
    }

    function test_setPrice_emitsEvent() public {
        vm.expectEmit(false, false, false, true);
        emit FixedMorphoOracle.PriceUpdated(2 * ONE_TO_ONE);
        oracle.setPrice(2 * ONE_TO_ONE);
    }
}
