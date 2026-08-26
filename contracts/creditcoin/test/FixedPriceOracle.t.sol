// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {FixedPriceOracle} from "../src/FixedPriceOracle.sol";

contract FixedPriceOracleTest is Test {
    FixedPriceOracle oracle;
    address owner = address(this);
    uint256 constant INITIAL_PRICE = 3000 * 1e8;

    function setUp() public {
        oracle = new FixedPriceOracle(INITIAL_PRICE);
    }

    function test_constructor_setsInitialPrice() public view {
        assertEq(oracle.price(), INITIAL_PRICE);
    }

    function test_constructor_revertsOnZeroPrice() public {
        vm.expectRevert("price must be positive");
        new FixedPriceOracle(0);
    }

    function test_decimals_matchesChainlinkConvention() public view {
        assertEq(oracle.decimals(), 8);
    }

    function test_setPrice_byOwner_succeeds() public {
        oracle.setPrice(3500 * 1e8);
        assertEq(oracle.price(), 3500 * 1e8);
    }

    function test_setPrice_emitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit FixedPriceOracle.PriceUpdated(3500 * 1e8);
        oracle.setPrice(3500 * 1e8);
    }

    function test_setPrice_byNonOwner_reverts() public {
        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        oracle.setPrice(1);
    }

    function test_setPrice_zero_reverts() public {
        vm.expectRevert("price must be positive");
        oracle.setPrice(0);
    }
}
