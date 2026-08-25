// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @notice View surface CreditPool relies on to size credit limits (§2.3.3 creditLimit()).
interface IStreamVerifier {
    /// @notice Value still LOCKED (unvested) for this borrower's active stream.
    /// @dev Conservative by design: vested-but-unwithdrawn value is excluded because it
    ///      will be garnished on withdrawal anyway rather than counted as collateral.
    function remainingLocked(address user) external view returns (uint256);
}
