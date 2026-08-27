// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @notice What lending pools read and feed. scoreOf sizes a borrower's terms; local
///         same-chain protocols report repayments directly, no proof needed.
interface ICreditPassport {
    function scoreOf(address borrower) external view returns (uint256);
    function recordLocalRepay(address borrower, uint256 amount) external;
}
