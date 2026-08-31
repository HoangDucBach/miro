import type { Address } from "viem";

/**
 * Single place that resolves deployed contract addresses from NEXT_PUBLIC_* env vars.
 * Every hook reads addresses through this module, never `process.env` directly -- so
 * there is exactly one place to update when a contract is redeployed.
 */
function requirePublicEnv(key: string): Address {
  const v = process.env[key];
  if (!v) throw new Error(`missing required env var: ${key}`);
  return v as Address;
}

export const contracts = {
  creditPassport: requirePublicEnv("NEXT_PUBLIC_CREDIT_PASSPORT_CONTRACT"),
  passportPool: requirePublicEnv("NEXT_PUBLIC_PASSPORT_POOL_CONTRACT"),
  testUsdc: requirePublicEnv("NEXT_PUBLIC_TEST_USDC_CONTRACT"),
  priceOracle: requirePublicEnv("NEXT_PUBLIC_PRICE_ORACLE_CONTRACT"),
} as const;
