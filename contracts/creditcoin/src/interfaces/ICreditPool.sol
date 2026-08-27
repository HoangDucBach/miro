// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

interface ICreditPool {
    function onTokenWithdrawn(address borrower, uint256 amount) external;
}
