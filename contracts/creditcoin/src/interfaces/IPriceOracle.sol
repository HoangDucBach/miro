// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @notice Minimal price feed interface, shaped so a real feed (Chainlink's
///         AggregatorV3Interface, wrapped) can be swapped in without touching CreditPool.
interface IPriceOracle {
    /// @notice Latest price, scaled by 10**decimals(). For an ETH/USD feed this is the
    ///         USD price of 1 ETH.
    function price() external view returns (uint256);

    /// @notice Number of decimals `price()` is scaled by.
    function decimals() external view returns (uint8);
}
