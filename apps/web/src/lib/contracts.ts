import type { Address } from "viem";

/**
 * Single place that resolves deployed contract addresses from NEXT_PUBLIC_* env vars.
 * Every hook reads addresses through this module, never `process.env` directly -- so
 * there is exactly one place to update when a contract is redeployed.
 *
 * Each var is referenced **statically** (`process.env.NEXT_PUBLIC_X`, never
 * `process.env[key]`): Next.js inlines public env vars into the client bundle by literal
 * text substitution at build time, so a dynamic lookup compiles to `undefined` in the
 * browser and every contract call silently targets a missing address.
 */
function required(value: string | undefined, name: string): Address {
  if (!value) throw new Error(`missing required env var: ${name}`);
  return value as Address;
}

/**
 * Block the passport was deployed at. Optional: without it the source registry is scanned
 * over a recent window instead, which finds sources registered lately but can miss the
 * original ones. See usePassportSources.
 */
export const creditPassportDeployBlock: bigint | null = process.env
  .NEXT_PUBLIC_CREDIT_PASSPORT_DEPLOY_BLOCK
  ? BigInt(process.env.NEXT_PUBLIC_CREDIT_PASSPORT_DEPLOY_BLOCK)
  : null;

export const contracts = {
  creditPassport: required(
    process.env.NEXT_PUBLIC_CREDIT_PASSPORT_CONTRACT,
    "NEXT_PUBLIC_CREDIT_PASSPORT_CONTRACT",
  ),
  passportPool: required(process.env.NEXT_PUBLIC_PASSPORT_POOL_CONTRACT, "NEXT_PUBLIC_PASSPORT_POOL_CONTRACT"),
  testUsdc: required(process.env.NEXT_PUBLIC_TEST_USDC_CONTRACT, "NEXT_PUBLIC_TEST_USDC_CONTRACT"),
  priceOracle: required(process.env.NEXT_PUBLIC_PRICE_ORACLE_CONTRACT, "NEXT_PUBLIC_PRICE_ORACLE_CONTRACT"),
} as const;
