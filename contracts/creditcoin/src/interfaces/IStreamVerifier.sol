// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @notice What CreditPool reads to size a borrower's credit limit.
interface IStreamVerifier {
    /// @notice Unvested value still locked in this borrower's active stream.
    /// @dev Vested but unwithdrawn value doesn't count here, it gets garnished on
    ///      withdrawal instead of counted as collateral.
    function remainingLocked(address user) external view returns (uint256);
}
