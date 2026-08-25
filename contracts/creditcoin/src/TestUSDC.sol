// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Minimal mintable ERC20 for demo/LP seeding on CC3 Testnet. Not for production use.
contract TestUSDC is ERC20 {
    uint8 private constant _DECIMALS = 6;

    uint256 public constant FAUCET_AMOUNT = 10_000 * 1e6;
    mapping(address => uint256) public lastFaucetClaim;
    uint256 public constant FAUCET_COOLDOWN = 1 days;

    constructor() ERC20("Test USDC", "tUSDC") {}

    function decimals() public pure override returns (uint8) {
        return _DECIMALS;
    }

    /// @notice Faucet for demo and LP seeding, rate-limited but open to anyone.
    function faucet() external {
        require(
            lastFaucetClaim[msg.sender] == 0 || block.timestamp >= lastFaucetClaim[msg.sender] + FAUCET_COOLDOWN,
            "faucet on cooldown"
        );
        lastFaucetClaim[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
    }
}
