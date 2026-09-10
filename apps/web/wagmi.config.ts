import { defineConfig } from "@wagmi/cli";
import { react } from "@wagmi/cli/plugins";
import { parseAbi } from "viem";
// Imported from the abis module directly, not the package root: @miro/shared's index
// re-exports with TypeScript's ".js"-suffixed ESM specifiers, which the wagmi CLI's
// loader cannot resolve (it looks for a real types.js), and pulls in ethers besides.
// abis.ts has no imports of its own, so this path loads cleanly.
import {
  AAVE_FAUCET_ABI,
  AAVE_POOL_ABI,
  CREDIT_PASSPORT_ABI,
  MORPHO_ABI,
  PASSPORT_POOL_ABI,
  TEST_USDC_ABI,
  PRICE_ORACLE_ABI,
} from "../../packages/shared/src/abis";

/**
 * viem's human-readable ABI parser (unlike ethers') doesn't accept inline `tuple(...)`
 * parameters. The only two CreditPassport functions shaped that way --
 * `processAttestation` (raw Merkle/continuity proof data) and `setSource` (admin source
 * registration) -- are also the only two this dashboard has no legitimate reason to call:
 * submitting a proof is the worker's job, and registering a source is a one-time owner
 * action done via `cast send`, not through a borrower/LP-facing UI. Filtering them out
 * here is a deliberate "generate hooks only for what the frontend actually calls," not a
 * duplication of the ABI -- everything else still flows from @miro/shared unchanged.
 */
const forFrontend = (abi: readonly string[]) => abi.filter((sig) => !sig.includes("tuple("));

/**
 * Generates one typed hook per contract function directly from the ABIs already in
 * @miro/shared -- the single source of truth for ABIs stays there, this just turns them
 * into React hooks. Addresses are intentionally NOT declared here (they vary by
 * deployment/env), so every generated hook takes an `address` override at the call site --
 * see src/lib/contracts.ts for where those addresses come from.
 *
 * @miro/shared's ABIs are human-readable strings (the format ethers/the worker consumes);
 * viem/wagmi need the JSON ABI shape instead, so `parseAbi` converts at this one boundary
 * rather than changing the shared ABI format for every other consumer.
 *
 * Regenerate with: pnpm --filter @miro/web wagmi:generate
 */
export default defineConfig({
  out: "src/generated.ts",
  contracts: [
    { name: "CreditPassport", abi: parseAbi(forFrontend(CREDIT_PASSPORT_ABI)) },
    { name: "PassportPool", abi: parseAbi(PASSPORT_POOL_ABI) },
    { name: "TestUsdc", abi: parseAbi(TEST_USDC_ABI) },
    { name: "PriceOracle", abi: parseAbi(PRICE_ORACLE_ABI) },
    // Read-only on the frontend: the dashboard reports what a borrower already owes on
    // Sepolia, it never supplies or borrows there on their behalf. Morpho's write
    // functions are tuple-shaped and drop out through forFrontend anyway.
    { name: "AavePool", abi: parseAbi(forFrontend(AAVE_POOL_ABI)) },
    { name: "AaveFaucet", abi: parseAbi(AAVE_FAUCET_ABI) },
    { name: "Morpho", abi: parseAbi(forFrontend(MORPHO_ABI)) },
  ],
  plugins: [react()],
});
