// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Mintable ERC-20 used to bootstrap a demo Morpho Blue market on Sepolia (one
///         instance as the loan asset, one as the collateral asset). Not for production
///         use -- Morpho itself is real and unmodified, only the demo market's assets are
///         ours, since supplying a brand-new market needs tokens nobody else controls.
contract DemoToken is ERC20, Ownable {
    uint8 private immutable _decimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_)
        ERC20(name_, symbol_)
        Ownable(msg.sender)
    {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
