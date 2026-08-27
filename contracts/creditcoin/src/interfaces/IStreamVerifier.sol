// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @notice What CreditPool reads to size a borrower's credit limit.
interface IStreamVerifier {
    /// @notice Unvested value still locked in this borrower's active stream, denominated
    ///         in the collateral token's own decimals (not always 18 -- see collateralToken).
    /// @dev Vested but unwithdrawn value doesn't count here, it gets garnished on
    ///      withdrawal instead of counted as collateral.
    function remainingLocked(address user) external view returns (uint256);

    /// @notice The ERC-20 vested by this borrower's stream, so CreditPool knows which
    ///         price oracle and decimals to price remainingLocked() through.
    function collateralToken(address user) external view returns (address);
}
