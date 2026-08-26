// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script, console} from "forge-std/Script.sol";
import {StreamVerifierASC} from "../src/StreamVerifierASC.sol";
import {CreditPool} from "../src/CreditPool.sol";
import {EmployerRegistry} from "../src/EmployerRegistry.sol";
import {TestUSDC} from "../src/TestUSDC.sol";
import {FixedPriceOracle} from "../src/FixedPriceOracle.sol";

/// forge script script/Deploy.s.sol --rpc-url cc3_testnet --private-key $CC3_DEPLOYER_PRIVATE_KEY --broadcast
///
/// Needs STREAM_CONTRACT (Sepolia SalaryStream address) and SOURCE_CHAIN_KEY (Sepolia's
/// Creditcoin chainKey, fetched off-chain via getSupportedChains) set as env vars first.
/// Optional ORACLE_INITIAL_PRICE (8 decimals, USD per ETH) defaults to 3000e8.
contract DeployScript is Script {
    function run()
        external
        returns (
            EmployerRegistry registry,
            TestUSDC usdc,
            FixedPriceOracle oracle,
            StreamVerifierASC asc,
            CreditPool pool
        )
    {
        address streamContract = vm.envAddress("STREAM_CONTRACT");
        uint64 sourceChainKey = uint64(vm.envUint("SOURCE_CHAIN_KEY"));
        uint256 initialPrice = vm.envOr("ORACLE_INITIAL_PRICE", uint256(3000 * 1e8));

        vm.startBroadcast();

        registry = new EmployerRegistry();
        usdc = new TestUSDC();
        oracle = new FixedPriceOracle(initialPrice);
        asc = new StreamVerifierASC(address(registry), sourceChainKey, streamContract);
        pool = new CreditPool(address(usdc), address(asc), address(oracle));
        asc.setPool(address(pool));

        vm.stopBroadcast();

        console.log("EmployerRegistry:", address(registry));
        console.log("TestUSDC:", address(usdc));
        console.log("FixedPriceOracle:", address(oracle));
        console.log("StreamVerifierASC:", address(asc));
        console.log("CreditPool:", address(pool));
    }
}
