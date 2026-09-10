import "dotenv/config";
import { AbiCoder, Contract, Wallet, formatUnits, keccak256 } from "ethers";
import { AAVE_POOL_ABI, DEMO_TOKEN_ABI, MORPHO_ABI } from "@miro/shared";
import { sourceProvider } from "./lib/chain.js";

/**
 * Opens a loan on Aave V3 and on Morpho Blue for E2E_BORROWER_PRIVATE_KEY, and leaves both
 * unpaid.
 *
 * This is the half of the e2e flow that e2e.ts deliberately closes: it supplies, borrows,
 * and stops. The point is a wallet whose dashboard shows real outstanding debt on both
 * source protocols -- what a borrower actually looks like before they repay -- rather than
 * a history of settled positions.
 *
 * Nothing here is relayed, because there is nothing to relay: the passport scores Repay
 * events, and these loans have not been repaid. Repaying them (through Aave's or Morpho's
 * own UI, or `pnpm worker:e2e`) is what feeds the score.
 *
 * Safe to re-run: each call adds another supply and another borrow rather than replacing
 * the last, so run it once per wallet unless you want the position to grow.
 */

const AAVE_BORROW_INTEREST_RATE_MODE = 2n; // variable
const MORPHO_LLTV = 860000000000000000n; // 86%, the tier the demo market was created at

// LINK, not DAI/USDC/USDT: those three sit above their 2B supply cap on Sepolia from
// public testnet usage, so `supply` reverts. 18 decimals, like the demo tokens.
const AAVE_SUPPLY = 1_000n * 10n ** 18n;
// ~30% of the supplied value at the Aave testnet oracle's LINK price, which leaves a
// health factor around 2.5 -- a position that reads as healthy but genuinely open.
const AAVE_BORROW = 300n * 10n ** 18n;

const MORPHO_COLLATERAL = 10_000n * 10n ** 18n;
const MORPHO_BORROW = 1_000n * 10n ** 18n;
// Interest buffer, minted on top of what is borrowed. Closing a Morpho position repays
// shares, which price to slightly more than the principal the moment the market accrues --
// and the demo loan token mints only to its owner, so a borrower holding exactly what they
// borrowed can never repay in full from the dashboard.
const MORPHO_INTEREST_BUFFER = 50n * 10n ** 18n;

async function main() {
  const source = sourceProvider();

  const aavePoolAddress = requireEnv("AAVE_POOL_CONTRACT");
  const aaveFaucetAddress = requireEnv("AAVE_FAUCET_CONTRACT");
  const aaveReserveAddress = requireEnv("AAVE_RESERVE_ASSET_CONTRACT");
  const morphoAddress = requireEnv("MORPHO_CONTRACT");
  const loanTokenAddress = requireEnv("DEMO_LOAN_TOKEN_CONTRACT");
  const collateralTokenAddress = requireEnv("DEMO_COLLATERAL_TOKEN_CONTRACT");
  const oracleAddress = requireEnv("MORPHO_ORACLE_CONTRACT");
  const irmAddress = requireEnv("MORPHO_IRM_CONTRACT");

  // The deployer owns the demo tokens' mint and pays Aave's faucet; the borrower is the
  // wallet whose dashboard this is for.
  const deployer = new Wallet(requireEnv("DEPLOYER_PRIVATE_KEY"), source);
  const borrower = new Wallet(requireEnv("E2E_BORROWER_PRIVATE_KEY"), source);

  console.log(`[seed] deployer=${deployer.address} borrower=${borrower.address}`);

  const aavePool = new Contract(aavePoolAddress, AAVE_POOL_ABI, borrower);
  const aaveFaucet = new Contract(
    aaveFaucetAddress,
    ["function mint(address token, address to, uint256 amount) external returns (uint256)"],
    deployer,
  );
  const aaveReserve = new Contract(aaveReserveAddress, DEMO_TOKEN_ABI, borrower);

  console.log("[seed] 1/4 Aave: fauceting the reserve asset...");
  await (await aaveFaucet.mint(aaveReserveAddress, borrower.address, AAVE_SUPPLY)).wait(2);

  console.log("[seed] 2/4 Aave: supply + borrow, left open...");
  await (await aaveReserve.approve(aavePoolAddress, AAVE_SUPPLY)).wait(2);
  await (await aavePool.supply(aaveReserveAddress, AAVE_SUPPLY, borrower.address, 0)).wait(2);
  await (
    await aavePool.borrow(
      aaveReserveAddress,
      AAVE_BORROW,
      AAVE_BORROW_INTEREST_RATE_MODE,
      0,
      borrower.address,
    )
  ).wait(2);
  await reportAave(aavePool, borrower.address);

  const marketParams = {
    loanToken: loanTokenAddress,
    collateralToken: collateralTokenAddress,
    oracle: oracleAddress,
    irm: irmAddress,
    lltv: MORPHO_LLTV,
  };
  const marketId = morphoMarketId(marketParams);

  console.log("[seed] 3/4 Morpho: minting collateral for the borrower...");
  const collateralToken = new Contract(collateralTokenAddress, DEMO_TOKEN_ABI, deployer);
  await (await collateralToken.mint(borrower.address, MORPHO_COLLATERAL)).wait(2);

  console.log("[seed] 4/4 Morpho: supply collateral + borrow, left open...");
  const collateralAsBorrower = collateralToken.connect(borrower) as Contract;
  await (await collateralAsBorrower.approve(morphoAddress, MORPHO_COLLATERAL)).wait(2);
  const morpho = new Contract(morphoAddress, MORPHO_ABI, borrower);
  await (
    await morpho.supplyCollateral(marketParams, MORPHO_COLLATERAL, borrower.address, "0x")
  ).wait(2);
  await (
    await morpho.borrow(marketParams, MORPHO_BORROW, 0n, borrower.address, borrower.address)
  ).wait(2);

  const loanToken = new Contract(loanTokenAddress, DEMO_TOKEN_ABI, deployer);
  await (await loanToken.mint(borrower.address, MORPHO_INTEREST_BUFFER)).wait(2);
  await reportMorpho(morpho, marketId, borrower.address);

  console.log("[seed] done. Both positions are open; repay either one to feed the passport.");
}

async function reportAave(aavePool: Contract, borrower: string): Promise<void> {
  const [collateral, debt, , , , healthFactor]: bigint[] = await aavePool.getUserAccountData(borrower);
  // Aave prices a whole account in USD with 8 decimals, not in the asset supplied.
  console.log(
    `[seed]     Aave: $${formatUnits(debt, 8)} owed against $${formatUnits(collateral, 8)}, health ${formatUnits(healthFactor, 18)}`,
  );
}

async function reportMorpho(morpho: Contract, marketId: string, borrower: string): Promise<void> {
  const [, borrowShares, collateral]: bigint[] = await morpho.position(marketId, borrower);
  const [, , totalBorrowAssets, totalBorrowShares]: bigint[] = await morpho.market(marketId);
  // Positions are held in shares; only the market totals price them back into assets.
  const owed =
    borrowShares === 0n
      ? 0n
      : (borrowShares * (totalBorrowAssets + 1n) + (totalBorrowShares + 1_000_000n - 1n)) /
        (totalBorrowShares + 1_000_000n);
  console.log(
    `[seed]     Morpho: ${formatUnits(owed, 18)} loan token owed against ${formatUnits(collateral, 18)} collateral`,
  );
}

/** Mirrors Morpho's MarketParamsLib.id() -- keccak256 over the five params as 32-byte words. */
function morphoMarketId(p: {
  loanToken: string;
  collateralToken: string;
  oracle: string;
  irm: string;
  lltv: bigint;
}): string {
  return keccak256(
    AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "address", "address", "uint256"],
      [p.loanToken, p.collateralToken, p.oracle, p.irm, p.lltv],
    ),
  );
}

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`missing required env var: ${key}`);
  return v;
}

main().catch((err) => {
  console.error("[seed] failed", err);
  process.exit(1);
});
