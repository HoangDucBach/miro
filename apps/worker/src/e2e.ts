import "dotenv/config";
import { Contract, Wallet, formatUnits } from "ethers";
import type { chainInfo, proofProvider } from "@gluwa/usc-sdk";
import { SABLIER_LOCKUP_ABI, NEBULA_TOKEN_ABI, CREDIT_POOL_ABI, TEST_USDC_ABI, PRICE_ORACLE_ABI } from "@miro/shared";
import {
  ATTESTATION_POLL_MS,
  ATTESTATION_TIMEOUT_MS,
  creditcoinProvider,
  makeChainInfoProvider,
  resolveSourceChainKey,
  sourceProvider,
} from "./lib/chain.js";
import { makeHostedProofBuilder } from "./lib/proof.js";
import { ascContract, submitProof } from "./lib/submitter.js";

/**
 * Scripted E2E demo flow (token-vesting design):
 *   whitelist NEBULA as collateral -> grantor mints + locks it in a real Sablier stream ->
 *   relay -> borrow -> withdraw vested NEBULA -> relay -> garnish freezes borrowing ->
 *   settle -> repay -> LTV steps up
 *
 * Runs against real deployed contracts (SABLIER_LOCKUP_CONTRACT / ASC_CONTRACT / etc in
 * .env) plus Sablier's own real, unmodified SablierLockup deployment on Sepolia -- see
 * docs/attestcoin-integration.md for that address. Inlines the same relay steps
 * apps/worker/src/index.ts runs continuously, so this script doesn't need a separate
 * worker process running alongside it.
 *
 * Attestation waits are minutes-scale on testnet, so a full run can take a while.
 * For the demo video, pre-record segments instead of running this live.
 */

// 5 minutes turned out too short in the salary-stream design: the relay pipeline itself
// (two attestation waits, tx confirmations) regularly eats several minutes end to end, so
// by the time creditLimit was checked the stream had already fully vested and there was
// nothing left to borrow against. 30 minutes leaves enough of a runway for that to stay
// meaningfully nonzero -- same reasoning applies here.
const STREAM_DURATION_SECONDS = 30 * 60;
const STREAM_DEPOSIT = 6000n * 10n ** 18n; // 6000 NEBULA, 18 decimals
const DEMO_PRICE_USD = 3000n * 10n ** 8n; // $3000/NEBULA, 8 decimals (FixedPriceOracle convention)
const DEMO_BASE_LTV_BPS = 4000n; // lower than a blue-chip-collateral cap: NEBULA is a thin-liquidity demo token
const VEST_WAIT_MS = 60_000; // real wall-clock wait for some NEBULA to vest before withdrawing

async function main() {
  const source = sourceProvider();
  const cc = creditcoinProvider();

  const sablierLockupAddress = requireEnv("SABLIER_LOCKUP_CONTRACT");
  const nebulaAddress = requireEnv("NEBULA_TOKEN_CONTRACT");
  const ascAddress = requireEnv("ASC_CONTRACT");
  const poolAddress = requireEnv("CREDIT_POOL_CONTRACT");
  const usdcAddress = requireEnv("TEST_USDC_CONTRACT");
  const oracleAddress = requireEnv("PRICE_ORACLE_CONTRACT");
  const proverUrl = process.env.PROVER_URL ?? "https://prover.cc3-testnet.creditcoin.network";

  const grantorKey = requireEnv("DEPLOYER_PRIVATE_KEY"); // plays the token-grantor role on Sepolia
  const poolOwnerKey = requireEnv("CC3_DEPLOYER_PRIVATE_KEY"); // CreditPool owner, whitelists collateral
  const workerKey = requireEnv("WORKER_PRIVATE_KEY"); // relay role, submits proofs to the ASC

  const grantorSepolia = new Wallet(grantorKey, source);
  const poolOwnerCC = new Wallet(poolOwnerKey, cc);

  // Generate a fresh throwaway borrower per run -- sidesteps StreamVerifierASC's
  // one-active-stream-per-borrower limit colliding with a previous run's leftover state,
  // funded with just enough ETH/tCTC from the grantor to cover its own gas.
  const borrower = Wallet.createRandom();
  const borrowerSepolia = borrower.connect(source);
  const borrowerCC = borrower.connect(cc);

  const sablierLockup = new Contract(sablierLockupAddress, SABLIER_LOCKUP_ABI, grantorSepolia);
  const nebula = new Contract(nebulaAddress, NEBULA_TOKEN_ABI, grantorSepolia);
  const pool = new Contract(poolAddress, CREDIT_POOL_ABI, borrowerCC);
  const usdc = new Contract(usdcAddress, TEST_USDC_ABI, borrowerCC);
  const asc = ascContract(cc, ascAddress, workerKey);

  const chainInfoProvider = makeChainInfoProvider(cc);
  const sepolia = await resolveSourceChainKey(chainInfoProvider);
  const builder = makeHostedProofBuilder(sepolia.chainKey, proverUrl);

  console.log(`[e2e] grantor=${grantorSepolia.address} borrower=${borrower.address}`);

  console.log("[e2e] 0/11 funding the fresh borrower wallet for gas...");
  const fundSepoliaTx = await grantorSepolia.sendTransaction({ to: borrower.address, value: 5_000_000_000_000_000n });
  await fundSepoliaTx.wait();
  const fundCCTx = await grantorSepolia.connect(cc).sendTransaction({ to: borrower.address, value: 20_000_000_000_000_000_000n });
  await fundCCTx.wait();

  // 1. Whitelist NEBULA as collateral, if this is the first run.
  const existingConfig = await pool.collateralConfig(nebulaAddress);
  if (!existingConfig.enabled) {
    console.log("[e2e] 1/11 whitelisting NEBULA as collateral in CreditPool...");
    const tx = await (pool.connect(poolOwnerCC) as Contract).setCollateralToken(
      nebulaAddress,
      oracleAddress,
      DEMO_BASE_LTV_BPS,
      true,
    );
    await tx.wait();
    const oracle = new Contract(oracleAddress, PRICE_ORACLE_ABI, poolOwnerCC);
    const setPriceTx = await oracle.setPrice(DEMO_PRICE_USD);
    await setPriceTx.wait();
    console.log(`[e2e]     whitelisted, tx: ${tx.hash}`);
  } else {
    console.log("[e2e] 1/11 NEBULA already whitelisted, skipping");
  }

  // 2. Grantor mints NEBULA and locks it in a real Sablier Lockup Linear stream, on Sepolia.
  console.log("[e2e] 2/11 minting NEBULA and creating a Sablier stream...");
  const mintTx = await nebula.mint(grantorSepolia.address, STREAM_DEPOSIT);
  await mintTx.wait();
  const approveTx = await nebula.approve(sablierLockupAddress, STREAM_DEPOSIT);
  await approveTx.wait();

  const createTx = await sablierLockup.createWithDurationsLL(
    {
      sender: grantorSepolia.address,
      recipient: borrowerSepolia.address,
      depositAmount: STREAM_DEPOSIT,
      token: nebulaAddress,
      cancelable: false, // required: StreamVerifierASC rejects any cancelable stream
      transferable: false, // required: keeps the recipient a permanent identity for the loan
      shape: "miro-demo-linear",
    },
    { start: 0n, cliff: 0n }, // no instant/cliff unlock, pure linear vesting
    0, // granularity: continuous per-second vesting
    { cliff: 0, total: STREAM_DURATION_SECONDS },
  );
  const createReceipt = await createTx.wait();
  const streamId = parseStreamId(sablierLockup, createReceipt);
  console.log(`[e2e]     tx: ${createTx.hash}, streamId: ${streamId}`);

  // 3. Relay CreateLockupLinearStream to the verifier.
  console.log("[e2e] 3/11 relaying CreateLockupLinearStream...");
  await relayEvent(
    chainInfoProvider,
    builder,
    sepolia.chainKey,
    asc,
    createTx.hash,
    createReceipt.blockNumber,
    "CreateLockupLinearStream",
  );
  const recordedToken: string = await asc.collateralToken(borrowerCC.address);
  console.log(`[e2e]     asc.collateralToken(borrower) = ${recordedToken}`);

  // 4. Seed LP liquidity so the pool has tUSDC to lend, if it doesn't already.
  console.log("[e2e] 4/11 seeding LP liquidity...");
  await seedLP(usdc.connect(poolOwnerCC) as Contract, pool.connect(poolOwnerCC) as Contract, poolOwnerCC.address);

  // 5. Borrower borrows against the stream.
  const limit: bigint = await pool.creditLimit(borrowerCC.address);
  console.log(`[e2e] 5/11 credit limit: ${formatUnits(limit, 6)} tUSDC`);
  if (limit > 0n) {
    const borrowAmount = limit / 2n;
    const tx = await pool.borrow(borrowAmount);
    await tx.wait();
    console.log(`[e2e]     borrowed ${formatUnits(borrowAmount, 6)} tUSDC, tx: ${tx.hash}`);
  } else {
    console.log("[e2e]     credit limit is 0 (stream not vesting yet?), skipping borrow");
  }

  // 6. Wait for some real vesting time, then withdraw vested NEBULA on Sepolia.
  console.log(`[e2e] 6/11 waiting ${VEST_WAIT_MS / 1000}s for NEBULA to vest...`);
  await sleep(VEST_WAIT_MS);
  const withdrawable: bigint = await sablierLockup.withdrawableAmountOf(streamId);
  console.log(`[e2e]     withdrawable balance: ${formatUnits(withdrawable, 18)} NEBULA`);
  if (withdrawable > 0n) {
    const sablierAsBorrower = sablierLockup.connect(borrowerSepolia) as Contract;
    const wTx = await sablierAsBorrower.withdrawMax(streamId, borrowerSepolia.address);
    const wReceipt = await wTx.wait();
    console.log(`[e2e]     withdrew, tx: ${wTx.hash}`);

    // 7. Relay WithdrawFromLockupStream -- this is what triggers garnishment.
    console.log("[e2e] 7/11 relaying WithdrawFromLockupStream...");
    await relayEvent(
      chainInfoProvider,
      builder,
      sepolia.chainKey,
      asc,
      wTx.hash,
      wReceipt.blockNumber,
      "WithdrawFromLockupStream",
    );
  } else {
    console.log("[e2e]     nothing vested yet, skipping withdraw + garnish steps");
  }

  // 8. Confirm garnishment froze borrowing, then settle it.
  const pendingGarnish: bigint = await pool.pendingGarnish(borrowerCC.address);
  console.log(`[e2e] 8/11 pendingGarnish: ${formatUnits(pendingGarnish, 6)} tUSDC`);
  if (pendingGarnish > 0n) {
    try {
      await pool.borrow.staticCall(1n);
      console.log("[e2e]     WARNING: borrow() did not revert despite pending garnish");
    } catch {
      console.log("[e2e]     confirmed: borrow() reverts while garnish is outstanding");
    }

    await ensureUsdcBalance(usdc, borrowerCC.address, pendingGarnish);
    const approveGarnishTx = await usdc.approve(poolAddress, pendingGarnish);
    await approveGarnishTx.wait();
    const settleTx = await pool.settleGarnish(pendingGarnish);
    await settleTx.wait();
    console.log(`[e2e]     settled garnish, tx: ${settleTx.hash}`);
  }

  // 9. Repay whatever debt remains in full, growing the borrower's credit tier.
  const debt: bigint = await pool.debt(borrowerCC.address);
  console.log(`[e2e] 9/11 remaining debt: ${formatUnits(debt, 6)} tUSDC`);
  if (debt > 0n) {
    await ensureUsdcBalance(usdc, borrowerCC.address, debt);
    const approveDebtTx = await usdc.approve(poolAddress, debt);
    await approveDebtTx.wait();
    const repayTx = await pool.repay(debt);
    await repayTx.wait();
    console.log(`[e2e]     repaid in full, tx: ${repayTx.hash}`);
  }

  const repaidLoans: bigint = await pool.repaidLoans(borrowerCC.address);
  console.log(`[e2e] done. repaidLoans(borrower) = ${repaidLoans}`);
}

/** Waits for attestation, fetches the proof, and submits it — the same steps the
 *  worker's drainQueue runs, just inlined here so this script is self-contained. */
async function relayEvent(
  chainInfoProvider: chainInfo.ChainInfoProvider,
  builder: proofProvider.ProofProvider,
  chainKey: number,
  asc: Contract,
  txHash: string,
  blockNumber: number,
  label: string,
): Promise<void> {
  console.log(`[e2e]     waiting for ${label} (block ${blockNumber}) to be attested...`);
  await chainInfoProvider.waitUntilHeightAttested(chainKey, blockNumber, ATTESTATION_POLL_MS, ATTESTATION_TIMEOUT_MS);
  console.log(`[e2e]     fetching proof for ${label}...`);
  const r = await builder.getProof(txHash);
  if (!r.success || !r.data) throw new Error(r.error ?? `proof unavailable for ${label}`);
  const result = await submitProof(asc, r.data);
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

function parseStreamId(
  sablierLockup: Contract,
  receipt: { logs: Array<{ topics: readonly string[]; data: string }> },
): bigint {
  for (const log of receipt.logs) {
    try {
      const parsed = sablierLockup.interface.parseLog({ topics: log.topics as string[], data: log.data });
      if (parsed?.name === "CreateLockupLinearStream") return parsed.args.streamId as bigint;
    } catch {
      // not one of our events, skip
    }
  }
  throw new Error("CreateLockupLinearStream log not found in create tx receipt");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
