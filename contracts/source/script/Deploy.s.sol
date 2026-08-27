// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script, console} from "forge-std/Script.sol";
import {NebulaToken} from "../src/NebulaToken.sol";

/// forge script script/Deploy.s.sol --rpc-url sepolia --private-key $DEPLOYER_PRIVATE_KEY --broadcast --verify
///
/// Deploys only the demo collateral token. The vesting stream itself is created directly
/// against Sablier's real, already-deployed SablierLockup contract on Sepolia -- see
/// docs/attestcoin-integration.md for that address and the createWithDurationsLL() call.
contract DeployScript is Script {
    function run() external returns (NebulaToken nebula) {
        vm.startBroadcast();
        nebula = new NebulaToken();
        vm.stopBroadcast();

        console.log("NebulaToken deployed at:", address(nebula));
    }
}
