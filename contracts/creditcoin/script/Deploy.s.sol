// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script, console} from "forge-std/Script.sol";
import {StreamVerifierASC} from "../src/StreamVerifierASC.sol";
import {CreditPool} from "../src/CreditPool.sol";
import {EmployerRegistry} from "../src/EmployerRegistry.sol";
import {TestUSDC} from "../src/TestUSDC.sol";

/// forge script script/Deploy.s.sol --rpc-url cc3_testnet --private-key $CC3_DEPLOYER_PRIVATE_KEY --broadcast
///
/// Requires STREAM_CONTRACT (Sepolia SalaryStream address) and SOURCE_CHAIN_KEY
/// (Sepolia's Creditcoin-internal chainKey, resolved off-chain via
/// PrecompileChainInfoProvider.getSupportedChains() — see apps/worker/src/chain.ts)
/// as env vars before running.
contract DeployScript is Script {
    function run()
        external
        returns (EmployerRegistry registry, TestUSDC usdc, StreamVerifierASC asc, CreditPool pool)
    {
        address streamContract = vm.envAddress("STREAM_CONTRACT");
        uint64 sourceChainKey = uint64(vm.envUint("SOURCE_CHAIN_KEY"));

        vm.startBroadcast();

        registry = new EmployerRegistry();
        usdc = new TestUSDC();
        asc = new StreamVerifierASC(address(registry), sourceChainKey, streamContract);
        pool = new CreditPool(address(usdc), address(asc));
        asc.setPool(address(pool));

        vm.stopBroadcast();

        console.log("EmployerRegistry:", address(registry));
        console.log("TestUSDC:", address(usdc));
        console.log("StreamVerifierASC:", address(asc));
        console.log("CreditPool:", address(pool));
    }
}
