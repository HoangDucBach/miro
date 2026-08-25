// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

interface IEmployerRegistry {
    function isVerified(address employer) external view returns (bool);
}
