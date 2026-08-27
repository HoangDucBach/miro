// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script, console} from "forge-std/Script.sol";
import {DemoToken} from "../src/DemoToken.sol";
import {FixedMorphoOracle} from "../src/FixedMorphoOracle.sol";

/// forge script script/Deploy.s.sol --rpc-url sepolia --private-key $DEPLOYER_PRIVATE_KEY --broadcast --verify
///
/// Deploys only the demo Morpho market's own assets + oracle. Morpho Blue itself and its
/// real Sepolia deployment are not touched here -- market creation
/// (`Morpho.createMarket(...)`) happens afterward against these addresses, see
/// docs/attestcoin-integration.md. The Aave leg needs no deploys at all: it uses Aave's
/// own real testnet reserves.
contract DeployScript is Script {
    function run() external returns (DemoToken loanToken, DemoToken collateralToken, FixedMorphoOracle oracle) {
        vm.startBroadcast();
        loanToken = new DemoToken("Miro Demo Loan", "mLOAN", 18);
        collateralToken = new DemoToken("Miro Demo Collateral", "mCOL", 18);
        oracle = new FixedMorphoOracle(18, 18, 1e36); // 1:1 price, both assets 18 decimals
        vm.stopBroadcast();

        console.log("DemoToken (loan):", address(loanToken));
        console.log("DemoToken (collateral):", address(collateralToken));
        console.log("FixedMorphoOracle:", address(oracle));
    }
}
