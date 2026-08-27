// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Demo collateral token, vested to borrowers via Sablier's real Lockup contract
///         on Sepolia. Not for production use -- exists so the demo has a controllable
///         price and supply instead of depending on a real, illiquid third-party token.
contract NebulaToken is ERC20, Ownable {
    constructor() ERC20("Nebula", "NEBULA") Ownable(msg.sender) {}

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
