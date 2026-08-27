// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script, console} from "forge-std/Script.sol";
import {CreditPassport} from "../src/CreditPassport.sol";
import {PassportPool} from "../src/PassportPool.sol";
import {TestUSDC} from "../src/TestUSDC.sol";
import {FixedPriceOracle} from "../src/FixedPriceOracle.sol";

/// forge script script/Deploy.s.sol --rpc-url cc3_testnet --private-key $CC3_DEPLOYER_PRIVATE_KEY --broadcast
///
/// Deploys the passport and its PoC lending pool. Source registration (Aave, Morpho on
/// Sepolia) happens afterward via `passport.setSource(...)` -- see
/// docs/attestcoin-integration.md for the exact calls and addresses, since sources are
/// config, not constructor args.
///
/// Optional ORACLE_INITIAL_PRICE (8 decimals, USD per native tCTC) defaults to 1e8 ($1).
contract DeployScript is Script {
    function run()
        external
        returns (TestUSDC usdc, FixedPriceOracle oracle, CreditPassport passport, PassportPool pool)
    {
        uint256 initialPrice = vm.envOr("ORACLE_INITIAL_PRICE", uint256(1e8));

        vm.startBroadcast();

        usdc = new TestUSDC();
        oracle = new FixedPriceOracle(initialPrice);
        passport = new CreditPassport();
        pool = new PassportPool(address(usdc), address(passport), address(oracle));
        passport.setLocalReporter(address(pool), true);

        vm.stopBroadcast();

        console.log("TestUSDC:", address(usdc));
        console.log("FixedPriceOracle:", address(oracle));
        console.log("CreditPassport:", address(passport));
        console.log("PassportPool:", address(pool));
    }
}
