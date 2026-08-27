import "dotenv/config";
import { Contract, Wallet, formatUnits } from "ethers";
import type { chainInfo, proofProvider } from "@gluwa/usc-sdk";
import {
  CREDIT_PASSPORT_ABI,
  PASSPORT_POOL_ABI,
  TEST_USDC_ABI,
  AAVE_POOL_ABI,
  MORPHO_ABI,
  DEMO_TOKEN_ABI,
  EVENT_TOPICS,
} from "@miro/shared";
import {
  ATTESTATION_POLL_MS,
  ATTESTATION_TIMEOUT_MS,
  creditcoinProvider,
  makeChainInfoProvider,
  resolveSourceChainKey,
  sourceProvider,
} from "./lib/chain.js";
import { makeHostedProofBuilder } from "./lib/proof.js";
import { passportContract, submitProof } from "./lib/submitter.js";

/**
 * Scripted E2E demo flow (credit passport design):
 *   register sources -> real Aave repay -> relay -> score ticks up ->
 *   real Morpho repay -> relay -> diversity bonus -> local PassportPool loan,
 *   repaid in full -> pool reports to the same passport it reads from.
 *
 * Runs against real deployed contracts (CREDIT_PASSPORT_CONTRACT / PASSPORT_POOL_CONTRACT
 * / etc in .env) plus Aave V3's and Morpho Blue's real, unmodified Sepolia deployments --
 * see docs/attestcoin-integration.md for addresses.
 *
 * Attestation waits are minutes-scale on testnet, so a full run can take a while.
 * For the demo video, pre-record segments instead of running this live.
 *
 * Known live-run risks (see docs/attestcoin-integration.md and the plan's Risks section):
 * Aave's public testnet Faucet caps mints at 10000 units and may be permissioned on some
 * deployments; the Morpho market bootstrap needs an enabled LLTV + IRM, checked on-chain
 * below rather than assumed.
 */

const AAVE_BORROW_INTEREST_RATE_MODE = 2n; // variable
const MORPHO_LLTV = 860000000000000000n; // 86%, a commonly-enabled Morpho LLTV tier
const DEMO_COLLATERAL_DEPOSIT = 10_000n * 10n ** 18n;
const DEMO_LOAN_LIQUIDITY = 10_000n * 10n ** 18n;
const DEMO_BORROW_AMOUNT = 1_000n * 10n ** 18n;

async function main() {
  const source = sourceProvider();
  const cc = creditcoinProvider();

  const passportAddress = requireEnv("CREDIT_PASSPORT_CONTRACT");
  const poolAddress = requireEnv("PASSPORT_POOL_CONTRACT");
  const usdcAddress = requireEnv("TEST_USDC_CONTRACT");
  const aavePoolAddress = requireEnv("AAVE_POOL_CONTRACT");
  const aaveFaucetAddress = requireEnv("AAVE_FAUCET_CONTRACT");
  const aaveDaiAddress = requireEnv("AAVE_DAI_CONTRACT");
  const morphoAddress = requireEnv("MORPHO_CONTRACT");
  const demoLoanTokenAddress = requireEnv("DEMO_LOAN_TOKEN_CONTRACT");
  const demoCollateralTokenAddress = requireEnv("DEMO_COLLATERAL_TOKEN_CONTRACT");
  const morphoOracleAddress = requireEnv("MORPHO_ORACLE_CONTRACT");
  const proverUrl = process.env.PROVER_URL ?? "https://prover.cc3-testnet.creditcoin.network";

  const deployerKey = requireEnv("DEPLOYER_PRIVATE_KEY"); // owns the demo Sepolia assets
  const poolOwnerKey = requireEnv("CC3_DEPLOYER_PRIVATE_KEY"); // CreditPassport/PassportPool owner
  const workerKey = requireEnv("WORKER_PRIVATE_KEY"); // relay role, submits proofs

  const deployerSepolia = new Wallet(deployerKey, source);
  const poolOwnerCC = new Wallet(poolOwnerKey, cc);

  // Fresh borrower per run so replays and the demo score progression stay legible.
  const borrower = Wallet.createRandom();
  const borrowerSepolia = borrower.connect(source);
  const borrowerCC = borrower.connect(cc);

  const passport = new Contract(passportAddress, CREDIT_PASSPORT_ABI, poolOwnerCC);
  const pool = new Contract(poolAddress, PASSPORT_POOL_ABI, borrowerCC);
  const usdc = new Contract(usdcAddress, TEST_USDC_ABI, borrowerCC);
  const aavePool = new Contract(aavePoolAddress, AAVE_POOL_ABI, borrowerSepolia);
  const aaveFaucet = new Contract(aaveFaucetAddress, ["function mint(address token, address to, uint256 amount) external returns (uint256)"], deployerSepolia);
  const aaveDai = new Contract(aaveDaiAddress, DEMO_TOKEN_ABI, borrowerSepolia);
  const morpho = new Contract(morphoAddress, MORPHO_ABI, deployerSepolia);
  const relayer = passportContract(cc, passportAddress, workerKey);

  const chainInfoProvider = makeChainInfoProvider(cc);
  const sepolia = await resolveSourceChainKey(chainInfoProvider);
  const builder = makeHostedProofBuilder(sepolia.chainKey, proverUrl);

  console.log(`[e2e] deployer=${deployerSepolia.address} borrower=${borrower.address}`);

  console.log("[e2e] 0/9 funding the fresh borrower wallet for gas...");
  const fundSepoliaTx = await deployerSepolia.sendTransaction({ to: borrower.address, value: 50_000_000_000_000_000n });
  await fundSepoliaTx.wait();
  const fundCCTx = await new Wallet(deployerKey, cc).sendTransaction({ to: borrower.address, value: 20_000_000_000_000_000_000n });
  await fundCCTx.wait();

  // 1. Register both Sepolia sources + the local PassportPool reporter, if this is the
  //    first run. Registration is config, not a redeploy -- see CreditPassport.setSource.
  console.log("[e2e] 1/9 ensuring sources are registered on the passport...");
  await ensureAaveSourceRegistered(passport, sepolia.chainKey, aavePoolAddress);
  await ensureMorphoSourceRegistered(passport, sepolia.chainKey, morphoAddress);
  await ensureLocalReporterRegistered(passport, poolAddress);

  // 2. Aave leg: faucet DAI, supply as collateral, borrow a small amount, repay in full.
  console.log("[e2e] 2/9 Aave: faucet + supply + borrow...");
  const daiAmount = 1000n * 10n ** 18n;
  const faucetTx = await aaveFaucet.mint(aaveDaiAddress, borrower.address, daiAmount);
  await faucetTx.wait();
  await (await aaveDai.approve(aavePoolAddress, daiAmount)).wait();
  await (await aavePool.supply(aaveDaiAddress, daiAmount, borrower.address, 0)).wait();
  const aaveBorrowAmount = 100n * 10n ** 18n;
  await (await aavePool.borrow(aaveDaiAddress, aaveBorrowAmount, AAVE_BORROW_INTEREST_RATE_MODE, 0, borrower.address)).wait();

  console.log("[e2e] 3/9 Aave: repaying in full...");
  // Extra DAI to cover any interest accrued between borrow and repay.
  await (await aaveFaucet.mint(aaveDaiAddress, borrower.address, daiAmount)).wait();
  await (await aaveDai.approve(aavePoolAddress, aaveBorrowAmount * 2n)).wait();
  const aaveRepayTx = await aavePool.repay(aaveDaiAddress, aaveBorrowAmount * 2n, AAVE_BORROW_INTEREST_RATE_MODE, borrower.address);
  const aaveRepayReceipt = await aaveRepayTx.wait();

  console.log("[e2e] 4/9 relaying Aave Repay...");
  await relayEvent(chainInfoProvider, builder, sepolia.chainKey, relayer, aaveRepayTx.hash, aaveRepayReceipt.blockNumber, "Aave Repay");
  console.log(`[e2e]     scoreOf(borrower) = ${await passport.scoreOf(borrower.address)}`);

  // 5. Morpho leg: create (if needed) a demo market, supply collateral, borrow, repay.
  console.log("[e2e] 5/9 Morpho: ensuring demo market exists...");
  const marketParams = await ensureMorphoMarketExists(
    morpho,
    demoLoanTokenAddress,
    demoCollateralTokenAddress,
    morphoOracleAddress,
  );
  await seedMorphoLiquidity(morpho, demoLoanTokenAddress, deployerSepolia, marketParams);

  console.log("[e2e] 6/9 Morpho: supply collateral + borrow...");
  const demoCollateralToken = new Contract(demoCollateralTokenAddress, DEMO_TOKEN_ABI, deployerSepolia);
  await (await demoCollateralToken.mint(borrower.address, DEMO_COLLATERAL_DEPOSIT)).wait();
  const demoCollateralAsBorrower = demoCollateralToken.connect(borrowerSepolia) as Contract;
  await (await demoCollateralAsBorrower.approve(morphoAddress, DEMO_COLLATERAL_DEPOSIT)).wait();
  const morphoAsBorrower = morpho.connect(borrowerSepolia) as Contract;
  await (await morphoAsBorrower.supplyCollateral(marketParams, DEMO_COLLATERAL_DEPOSIT, borrower.address, "0x")).wait();
  await (await morphoAsBorrower.borrow(marketParams, DEMO_BORROW_AMOUNT, 0n, borrower.address, borrower.address)).wait();

  console.log("[e2e] 7/9 Morpho: repaying in full...");
  const demoLoanToken = new Contract(demoLoanTokenAddress, DEMO_TOKEN_ABI, deployerSepolia);
  await (await demoLoanToken.mint(borrower.address, DEMO_BORROW_AMOUNT)).wait(); // cover accrued interest
  const demoLoanAsBorrower = demoLoanToken.connect(borrowerSepolia) as Contract;
  await (await demoLoanAsBorrower.approve(morphoAddress, DEMO_BORROW_AMOUNT * 2n)).wait();
  const morphoRepayTx = await morphoAsBorrower.repay(marketParams, DEMO_BORROW_AMOUNT * 2n, 0n, borrower.address, "0x");
  const morphoRepayReceipt = await morphoRepayTx.wait();

  console.log("[e2e] 8/9 relaying Morpho Repay...");
  await relayEvent(chainInfoProvider, builder, sepolia.chainKey, relayer, morphoRepayTx.hash, morphoRepayReceipt.blockNumber, "Morpho Repay");
  console.log(`[e2e]     scoreOf(borrower) = ${await passport.scoreOf(borrower.address)} (diversity bonus should show up now)`);

  // 9. Local leg: LP seeds PassportPool, borrower deposits tCTC, borrows, repays in full
  //    -- the same pool that just read the boosted score also feeds it back.
  console.log("[e2e] 9/9 PassportPool: local borrow/repay loop...");
  await seedLP(usdc.connect(poolOwnerCC) as Contract, pool.connect(poolOwnerCC) as Contract, poolOwnerCC.address);

  const ltvBefore: bigint = await pool.maxLtvBps(borrower.address);
  console.log(`[e2e]     maxLtvBps(borrower) before local history = ${ltvBefore}`);

  await (await pool.depositCollateral({ value: 2_500_000_000_000_000_000n })).wait(); // 2.5 tCTC
  const limit: bigint = await pool.creditLimit(borrower.address);
  console.log(`[e2e]     credit limit: ${formatUnits(limit, 6)} tUSDC`);
  if (limit > 0n) {
    const borrowAmount = limit / 2n;
    await (await pool.borrow(borrowAmount)).wait();
    const owed: bigint = await pool.debt(borrower.address);
    await ensureUsdcBalance(usdc, borrower.address, owed);
    await (await usdc.approve(poolAddress, owed)).wait();
    await (await pool.repay(owed)).wait();
    console.log("[e2e]     repaid in full -- PassportPool should have reported this to the passport");
  }

  console.log(`[e2e] done. final scoreOf(borrower) = ${await passport.scoreOf(borrower.address)}`);
  console.log(`[e2e]        maxLtvBps(borrower) after full loop = ${await pool.maxLtvBps(borrower.address)}`);
}

async function ensureAaveSourceRegistered(passport: Contract, chainKey: number, aavePoolAddress: string): Promise<void> {
  const sourceId = await passport.sourceIdFor(chainKey, aavePoolAddress, EVENT_TOPICS.AaveRepay);
  const existing = await passport.sources(sourceId);
  if (existing.enabled) return;
  const tx = await passport.setSource({
    chainKey,
    emitter: aavePoolAddress,
    topic0: EVENT_TOPICS.AaveRepay,
    borrowerLoc: 1, // Topic2 -- Aave's Repay indexes reserve, user, repayer; user is topic 2
    borrowerDataWord: 0,
    amountDataWord: 0, // amount is the only non-indexed field before useATokens
    minAmount: 10n * 10n ** 18n, // 10 DAI floor, anti-dust
    negative: false,
    enabled: true,
  });
  await tx.wait();
}

async function ensureMorphoSourceRegistered(passport: Contract, chainKey: number, morphoAddress: string): Promise<void> {
  const sourceId = await passport.sourceIdFor(chainKey, morphoAddress, EVENT_TOPICS.MorphoRepay);
  const existing = await passport.sources(sourceId);
  if (existing.enabled) return;
  const tx = await passport.setSource({
    chainKey,
    emitter: morphoAddress,
    topic0: EVENT_TOPICS.MorphoRepay,
    borrowerLoc: 2, // Topic3 -- Morpho's Repay indexes id, caller, onBehalf; onBehalf is topic 3
    borrowerDataWord: 0,
    amountDataWord: 0, // assets is the first non-indexed field, before shares
    minAmount: 10n * 10n ** 18n,
    negative: false,
    enabled: true,
  });
  await tx.wait();
}

async function ensureLocalReporterRegistered(passport: Contract, poolAddress: string): Promise<void> {
  const already: boolean = await passport.localReporters(poolAddress);
  if (already) return;
  const tx = await passport.setLocalReporter(poolAddress, true);
  await tx.wait();
}

interface MarketParams {
  loanToken: string;
  collateralToken: string;
  oracle: string;
  irm: string;
  lltv: bigint;
}

/** Creates the demo market once; safe to call repeatedly since Morpho's own createMarket
 *  is idempotent-by-params (same params always resolve to the same market id). */
async function ensureMorphoMarketExists(
  morpho: Contract,
  loanToken: string,
  collateralToken: string,
  oracle: string,
): Promise<MarketParams> {
  const irm = requireEnv("MORPHO_IRM_CONTRACT"); // e.g. AdaptiveCurveIRM's real Sepolia address
  const lltvEnabled: boolean = await morpho.isLltvEnabled(MORPHO_LLTV);
  if (!lltvEnabled) {
    throw new Error(
      `LLTV ${MORPHO_LLTV} not enabled on this Morpho deployment -- check morpho.isLltvEnabled() for a real tier before running this script`,
    );
  }
  const irmEnabled: boolean = await morpho.isIrmEnabled(irm);
  if (!irmEnabled) {
    throw new Error(`IRM ${irm} not enabled on this Morpho deployment -- check morpho.isIrmEnabled()`);
  }

  const marketParams: MarketParams = { loanToken, collateralToken, oracle, irm, lltv: MORPHO_LLTV };
  try {
    await (await morpho.createMarket(marketParams)).wait();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[e2e]     createMarket skipped (${msg}) -- likely already exists`);
  }
  return marketParams;
}

async function seedMorphoLiquidity(
  morpho: Contract,
  loanTokenAddress: string,
  lender: Wallet,
  marketParams: MarketParams,
): Promise<void> {
  const loanToken = new Contract(loanTokenAddress, DEMO_TOKEN_ABI, lender);
  await (await loanToken.mint(lender.address, DEMO_LOAN_LIQUIDITY)).wait();
  await (await loanToken.approve(await morpho.getAddress(), DEMO_LOAN_LIQUIDITY)).wait();
  const morphoAsLender = morpho.connect(lender) as Contract;
  await (await morphoAsLender.supply(marketParams, DEMO_LOAN_LIQUIDITY, 0n, lender.address, "0x")).wait();
}

/** Waits for attestation, fetches the proof, and submits it — the same steps the
 *  worker's queue processor runs, just inlined here so this script is self-contained. */
async function relayEvent(
  chainInfoProvider: chainInfo.ChainInfoProvider,
  builder: proofProvider.ProofProvider,
  chainKey: number,
  passport: Contract,
  txHash: string,
  blockNumber: number,
  label: string,
): Promise<void> {
  console.log(`[e2e]     waiting for ${label} (block ${blockNumber}) to be attested...`);
  await chainInfoProvider.waitUntilHeightAttested(chainKey, blockNumber, ATTESTATION_POLL_MS, ATTESTATION_TIMEOUT_MS);
  console.log(`[e2e]     fetching proof for ${label}...`);
  const r = await builder.getProof(txHash);
  if (!r.success || !r.data) throw new Error(r.error ?? `proof unavailable for ${label}`);
  const result = await submitProof(passport, r.data);
  console.log(`[e2e]     relayed ${label}: ${result}`);
}

async function seedLP(usdcAsLP: Contract, poolAsLP: Contract, lpAddress: string): Promise<void> {
  const seedAmount = 5000n * 10n ** 6n;
  try {
    const faucetTx = await usdcAsLP.faucet();
    await faucetTx.wait();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[e2e]     LP faucet unavailable (${msg}), reusing existing balance`);
  }
  const balance: bigint = await usdcAsLP.balanceOf(lpAddress);
  const amount = balance < seedAmount ? balance : seedAmount;
  if (amount === 0n) {
    console.log("[e2e]     no tUSDC available to seed the pool with, skipping");
    return;
  }
  const approveTx = await usdcAsLP.approve(await poolAsLP.getAddress(), amount);
  await approveTx.wait();
  const depositTx = await poolAsLP.deposit(amount);
  await depositTx.wait();
  console.log(`[e2e]     deposited ${formatUnits(amount, 6)} tUSDC as LP liquidity`);
}

async function ensureUsdcBalance(usdc: Contract, holder: string, needed: bigint): Promise<void> {
  const balance: bigint = await usdc.balanceOf(holder);
  if (balance >= needed) return;
  try {
    const tx = await usdc.faucet();
    await tx.wait();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`insufficient tUSDC (${formatUnits(balance, 6)}) and faucet unavailable: ${msg}`);
  }
}

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`missing required env var: ${key}`);
  return v;
}

main().catch((err) => {
  console.error("[e2e] failed", err);
  process.exit(1);
});
