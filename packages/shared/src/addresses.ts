/**
 * Deployed contract addresses. Filled in after `forge script` deploys (§2.5 env vars);
 * kept here — not re-declared per-app — so worker & web never drift (§2.7).
 */
export interface DeploymentAddresses {
  sepolia: {
    /** Aave V3's real, unmodified Pool deployment -- not ours. */
    aavePool: string;
    /** Morpho Blue's real, unmodified deployment -- not ours. */
    morpho: string;
    /** Demo loan/collateral assets + oracle for the demo Morpho market. */
    demoLoanToken: string;
    demoCollateralToken: string;
    morphoOracle: string;
  };
  cc3Testnet: {
    creditPassport: string;
    passportPool: string;
    testUSDC: string;
    priceOracle: string;
  };
}

export function loadAddressesFromEnv(env: Record<string, string | undefined> = process.env): DeploymentAddresses {
  const required = (key: string): string => {
    const v = env[key];
    if (!v) throw new Error(`missing required env var: ${key}`);
    return v;
  };

  return {
    sepolia: {
      aavePool: required("AAVE_POOL_CONTRACT"),
      morpho: required("MORPHO_CONTRACT"),
      demoLoanToken: required("DEMO_LOAN_TOKEN_CONTRACT"),
      demoCollateralToken: required("DEMO_COLLATERAL_TOKEN_CONTRACT"),
      morphoOracle: required("MORPHO_ORACLE_CONTRACT"),
    },
    cc3Testnet: {
      creditPassport: required("CREDIT_PASSPORT_CONTRACT"),
      passportPool: required("PASSPORT_POOL_CONTRACT"),
      testUSDC: required("TEST_USDC_CONTRACT"),
      priceOracle: required("PRICE_ORACLE_CONTRACT"),
    },
  };
}
