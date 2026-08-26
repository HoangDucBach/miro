/**
 * Deployed contract addresses. Filled in after `forge script` deploys (§2.5 env vars);
 * kept here — not re-declared per-app — so worker & web never drift (§2.7).
 */
export interface DeploymentAddresses {
  sepolia: {
    salaryStream: string;
  };
  cc3Testnet: {
    streamVerifierASC: string;
    creditPool: string;
    employerRegistry: string;
    testUSDC: string;
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
      salaryStream: required("STREAM_CONTRACT"),
    },
    cc3Testnet: {
      streamVerifierASC: required("ASC_CONTRACT"),
      creditPool: required("CREDIT_POOL_CONTRACT"),
      employerRegistry: required("EMPLOYER_REGISTRY_CONTRACT"),
      testUSDC: required("TEST_USDC_CONTRACT"),
    },
  };
}
