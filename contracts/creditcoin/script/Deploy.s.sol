// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script, console} from "forge-std/Script.sol";
import {StreamVerifierASC} from "../src/StreamVerifierASC.sol";
import {CreditPool} from "../src/CreditPool.sol";
import {TestUSDC} from "../src/TestUSDC.sol";
import {FixedPriceOracle} from "../src/FixedPriceOracle.sol";

/// forge script script/Deploy.s.sol --rpc-url cc3_testnet --private-key $CC3_DEPLOYER_PRIVATE_KEY --broadcast
///
/// Needs SABLIER_LOCKUP_CONTRACT (Sepolia SablierLockup address, real deployment -- not
/// ours, see docs/attestcoin-integration.md) and SOURCE_CHAIN_KEY (Sepolia's Creditcoin
/// chainKey, fetched off-chain via getSupportedChains) set as env vars first.
///
/// After this script, the demo collateral token (e.g. NEBULA, deployed separately on
/// Sepolia -- see contracts/source) must be whitelisted with
/// `pool.setCollateralToken(nebula, oracle, baseLtvBps, true)` before anyone can borrow
/// against a stream denominated in it.
///
/// Optional ORACLE_INITIAL_PRICE (8 decimals, USD per unit of the demo collateral token)
/// defaults to 3000e8.
contract DeployScript is Script {
    function run() external returns (TestUSDC usdc, FixedPriceOracle oracle, StreamVerifierASC asc, CreditPool pool) {
        address sablierLockup = vm.envAddress("SABLIER_LOCKUP_CONTRACT");
        uint64 sourceChainKey = uint64(vm.envUint("SOURCE_CHAIN_KEY"));
        uint256 initialPrice = vm.envOr("ORACLE_INITIAL_PRICE", uint256(3000 * 1e8));

        vm.startBroadcast();

        usdc = new TestUSDC();
        oracle = new FixedPriceOracle(initialPrice);
        asc = new StreamVerifierASC(sourceChainKey, sablierLockup);
        pool = new CreditPool(address(usdc), address(asc));
        asc.setPool(address(pool));

        vm.stopBroadcast();

        console.log("TestUSDC:", address(usdc));
        console.log("FixedPriceOracle:", address(oracle));
        console.log("StreamVerifierASC:", address(asc));
        console.log("CreditPool:", address(pool));
    }
}
