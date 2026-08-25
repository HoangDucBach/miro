// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

interface ICreditPool {
    function onSalaryWithdrawn(address borrower, uint256 salary) external;
    function onStreamCancelled(address borrower) external;
}
