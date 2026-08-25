// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script, console} from "forge-std/Script.sol";
import {SalaryStream} from "../src/SalaryStream.sol";

/// forge script script/Deploy.s.sol --rpc-url sepolia --private-key $DEPLOYER_PRIVATE_KEY --broadcast --verify
contract DeployScript is Script {
    function run() external returns (SalaryStream stream) {
        vm.startBroadcast();
        stream = new SalaryStream();
        vm.stopBroadcast();

        console.log("SalaryStream deployed at:", address(stream));
    }
}
