// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Owner-settable oracle implementing Morpho Blue's real `IOracle` interface, so
///         the demo market can be created against something Morpho itself will accept.
/// @dev Morpho's price() returns the price of 1 unit of collateral quoted in 1 unit of
///      loan token, scaled by 10**(36 + loanDecimals - collateralDecimals) (see
///      morpho-org/morpho-blue's IOracle.sol). This is NOT the same convention as
///      FixedPriceOracle on Creditcoin (Chainlink-style, 8 decimals) -- Morpho's own
///      lending math needs its own scale, this contract exists only to satisfy that.
contract FixedMorphoOracle is Ownable {
    uint8 public immutable loanDecimals;
    uint8 public immutable collateralDecimals;

    uint256 private _price;

    event PriceUpdated(uint256 price);

    constructor(uint8 loanDecimals_, uint8 collateralDecimals_, uint256 initialPrice) Ownable(msg.sender) {
        loanDecimals = loanDecimals_;
        collateralDecimals = collateralDecimals_;
        _setPrice(initialPrice);
    }

    function price() external view returns (uint256) {
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
