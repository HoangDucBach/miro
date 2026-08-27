// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {DemoToken} from "../src/DemoToken.sol";

contract DemoTokenTest is Test {
    DemoToken token;
    address owner = address(this);
    address alice = makeAddr("alice");

    function setUp() public {
        token = new DemoToken("Demo Loan", "DLOAN", 18);
    }

    function test_metadata() public view {
        assertEq(token.name(), "Demo Loan");
        assertEq(token.symbol(), "DLOAN");
        assertEq(token.decimals(), 18);
    }

    function test_customDecimals() public {
        DemoToken sixDecToken = new DemoToken("Demo Collateral", "DCOL", 6);
        assertEq(sixDecToken.decimals(), 6);
    }

    function test_mint_byOwner_succeeds() public {
        token.mint(alice, 1000e18);
        assertEq(token.balanceOf(alice), 1000e18);
        assertEq(token.totalSupply(), 1000e18);
    }

    function test_mint_byNonOwner_reverts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        token.mint(alice, 1000e18);
    }

    function test_mint_accumulatesAcrossCalls() public {
        token.mint(alice, 500e18);
        token.mint(alice, 500e18);
        assertEq(token.balanceOf(alice), 1000e18);
    }

    function test_transfer_worksAfterMint() public {
        token.mint(owner, 1000e18);
        token.transfer(alice, 400e18);
        assertEq(token.balanceOf(alice), 400e18);
        assertEq(token.balanceOf(owner), 600e18);
    }
}
