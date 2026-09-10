import type { Address } from "viem";
import { morphoMarketId, type MorphoMarketParams } from "./morpho";

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

/**
 * The source protocols the passport scores from, on Sepolia. Optional, unlike the four
 * above: a deployment that has not been pointed at Aave/Morpho still runs, it just hides
 * the cross-chain loans panel instead of throwing at module load.
 *
 * More than the pool addresses, because the dashboard repays these loans as well as
 * reading them: Aave needs the reserve asset to approve, its variable debt token to size
 * the repayment exactly, and its public faucet to top up a wallet that is short; Morpho
 * addresses a market by its five parameters on every write, and the id is derived from
 * them (see lib/morpho.ts) rather than configured twice.
 */
function optional(value: string | undefined): Address | null {
  return value ? (value as Address) : null;
}

const aavePool = optional(process.env.NEXT_PUBLIC_AAVE_POOL_CONTRACT);
const aaveReserveAsset = optional(process.env.NEXT_PUBLIC_AAVE_RESERVE_ASSET_CONTRACT);
const aaveVariableDebtToken = optional(process.env.NEXT_PUBLIC_AAVE_VARIABLE_DEBT_TOKEN);
const aaveFaucet = optional(process.env.NEXT_PUBLIC_AAVE_FAUCET_CONTRACT);

const morpho = optional(process.env.NEXT_PUBLIC_MORPHO_CONTRACT);
const morphoLoanToken = optional(process.env.NEXT_PUBLIC_MORPHO_LOAN_TOKEN_CONTRACT);
const morphoCollateralToken = optional(process.env.NEXT_PUBLIC_MORPHO_COLLATERAL_TOKEN_CONTRACT);
const morphoOracle = optional(process.env.NEXT_PUBLIC_MORPHO_ORACLE_CONTRACT);
const morphoIrm = optional(process.env.NEXT_PUBLIC_MORPHO_IRM_CONTRACT);
const morphoLltv = process.env.NEXT_PUBLIC_MORPHO_LLTV;

const morphoMarket: MorphoMarketParams | null =
  morphoLoanToken && morphoCollateralToken && morphoOracle && morphoIrm && morphoLltv
    ? {
        loanToken: morphoLoanToken,
        collateralToken: morphoCollateralToken,
        oracle: morphoOracle,
        irm: morphoIrm,
        lltv: BigInt(morphoLltv),
      }
    : null;

export const sourceProtocols = {
  aave:
    aavePool && aaveReserveAsset && aaveVariableDebtToken
      ? {
          pool: aavePool,
          /** The asset supplied and borrowed in the demo flow -- LINK, 18 decimals. */
          reserveAsset: aaveReserveAsset,
          /** Rebasing debt token: its balanceOf IS the borrower's debt, interest included. */
          variableDebtToken: aaveVariableDebtToken,
          /** Public testnet faucet, or null where none is configured. */
          faucet: aaveFaucet,
        }
      : null,
  morpho:
    morpho && morphoMarket
      ? { morpho, market: morphoMarket, marketId: morphoMarketId(morphoMarket) }
      : null,
} as const;
