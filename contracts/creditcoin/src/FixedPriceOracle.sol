// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPriceOracle} from "./interfaces/IPriceOracle.sol";

/// @notice Owner-settable price feed standing in for a real oracle on testnet. Implements
///         the same IPriceOracle interface a Chainlink adapter would, so CreditPool needs
///         no changes when this gets swapped out later. Not for production use: a single
///         owner-controlled price is a centralization point a real deployment must not have.
contract FixedPriceOracle is IPriceOracle, Ownable {
    uint8 public constant override decimals = 8; // matches Chainlink's ETH/USD feed convention

    uint256 private _price;

    event PriceUpdated(uint256 price);

    constructor(uint256 initialPrice) Ownable(msg.sender) {
        _setPrice(initialPrice);
    }

    function price() external view override returns (uint256) {
        return _price;
    }

    function setPrice(uint256 newPrice) external onlyOwner {
        _setPrice(newPrice);
    }

    function _setPrice(uint256 newPrice) internal {
        require(newPrice > 0, "price must be positive");
        _price = newPrice;
        emit PriceUpdated(newPrice);
    }
}
