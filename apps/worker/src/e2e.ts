import "dotenv/config";
import { Contract, Wallet, parseEther, formatUnits } from "ethers";
import type { chainInfo, proofProvider } from "@gluwa/usc-sdk";
import {
  SALARY_STREAM_ABI,
  CREDIT_POOL_ABI,
  TEST_USDC_ABI,
  EMPLOYER_REGISTRY_ABI,
} from "@streamcredit/shared";
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
 * Scripted E2E demo flow:
 *   register employer -> create stream -> relay -> borrow -> withdraw salary ->
 *   relay -> garnish freezes borrowing -> settle -> repay -> LTV steps up
 *
 * Runs against real deployed contracts (STREAM_CONTRACT / ASC_CONTRACT / etc in .env).
 * Inlines the same relay steps apps/worker/src/index.ts runs continuously, so this
 * script doesn't need a separate worker process running alongside it.
 *
 * Attestation waits are minutes-scale on testnet, so a full run can take a while.
 * For the demo video, pre-record segments instead of running this live.
 */

// 5 minutes turned out too short: the relay pipeline itself (two attestation waits, tx
// confirmations) regularly eats several minutes end to end, so by the time creditLimit
// was checked the stream had already fully vested and there was nothing left to borrow
// against. 30 minutes leaves enough of a runway for that to stay meaningfully nonzero.
const STREAM_DURATION_SECONDS = 30 * 60;
const STREAM_DEPOSIT = parseEther("0.002");
const VEST_WAIT_MS = 60_000; // real wall-clock wait for some salary to vest before withdrawing

async function main() {
  const source = sourceProvider();
  const cc = creditcoinProvider();

  const streamAddress = requireEnv("STREAM_CONTRACT");
  const ascAddress = requireEnv("ASC_CONTRACT");
  const poolAddress = requireEnv("CREDIT_POOL_CONTRACT");
  const usdcAddress = requireEnv("TEST_USDC_CONTRACT");
  const registryAddress = requireEnv("EMPLOYER_REGISTRY_CONTRACT");
  const proverUrl = process.env.PROVER_URL ?? "https://prover.cc3-testnet.creditcoin.network";

  const employerKey = requireEnv("DEPLOYER_PRIVATE_KEY");
  const workerKey = requireEnv("WORKER_PRIVATE_KEY"); // relay role, submits proofs to the ASC

  const employerSepolia = new Wallet(employerKey, source);
  const employerCC = new Wallet(employerKey, cc);

  // SalaryStream requires recipient != sender, so the borrower can't be the employer's own
  // key. Generate a fresh throwaway borrower per run (also sidesteps StreamVerifierASC's
  // one-active-stream-per-borrower limit colliding with a previous run's leftover state),
  // funded with just enough ETH/tCTC from the employer to cover its own gas.
  const borrower = Wallet.createRandom();
  const borrowerSepolia = borrower.connect(source);
  const borrowerCC = borrower.connect(cc);

  const stream = new Contract(streamAddress, SALARY_STREAM_ABI, employerSepolia);
  const registry = new Contract(registryAddress, EMPLOYER_REGISTRY_ABI, employerCC);
  const pool = new Contract(poolAddress, CREDIT_POOL_ABI, borrowerCC);
  const usdc = new Contract(usdcAddress, TEST_USDC_ABI, borrowerCC);
  const asc = ascContract(cc, ascAddress, workerKey);

  const chainInfoProvider = makeChainInfoProvider(cc);
  const sepolia = await resolveSourceChainKey(chainInfoProvider);
  const builder = makeHostedProofBuilder(sepolia.chainKey, proverUrl);

  console.log(`[e2e] employer=${employerSepolia.address} borrower=${borrower.address}`);

  console.log("[e2e] 0/10 funding the fresh borrower wallet for gas...");
  const fundSepoliaTx = await employerSepolia.sendTransaction({ to: borrower.address, value: parseEther("0.005") });
  await fundSepoliaTx.wait();
  const fundCCTx = await employerCC.sendTransaction({ to: borrower.address, value: parseEther("20") });
  await fundCCTx.wait();

  // 1. Register the employer if this is the first run.
  const alreadyVerified = await registry.isVerified(employerCC.address);
  if (!alreadyVerified) {
    console.log("[e2e] 1/10 registering employer in EmployerRegistry...");
    const minStake = await registry.MIN_STAKE();
    const tx = await registry.register({ value: minStake });
    await tx.wait();
    console.log(`[e2e]     staked ${formatUnits(minStake, 18)} tCTC, tx: ${tx.hash}`);
  } else {
    console.log("[e2e] 1/10 employer already registered, skipping");
  }

  // 2. Employer creates a salary stream on Sepolia.
  console.log("[e2e] 2/10 employer creates salary stream on Sepolia...");
  const stopTime = Math.floor(Date.now() / 1000) + STREAM_DURATION_SECONDS;
  const createTx = await stream.createStream(borrowerSepolia.address, stopTime, { value: STREAM_DEPOSIT });
  const createReceipt = await createTx.wait();
  const streamId = parseStreamId(stream, createReceipt);
  console.log(`[e2e]     tx: ${createTx.hash}, streamId: ${streamId}`);

  // 3. Relay SalaryStreamCreated to StreamVerifierASC.
  console.log("[e2e] 3/10 relaying SalaryStreamCreated...");
  await relayEvent(
    chainInfoProvider,
    builder,
    sepolia.chainKey,
    asc,
    createTx.hash,
    createReceipt.blockNumber,
    "SalaryStreamCreated",
  );
  const recordedStream = await asc.streamOf(borrowerCC.address);
  console.log(`[e2e]     asc.streamOf(borrower).exists = ${recordedStream.exists}`);

  // 4. Seed LP liquidity so the pool has tUSDC to lend, if it doesn't already.
  console.log("[e2e] 4/10 seeding LP liquidity...");
  await seedLP(usdc.connect(employerCC) as Contract, pool.connect(employerCC) as Contract, employerCC.address);

  // 5. Borrower borrows against the stream.
  const limit: bigint = await pool.creditLimit(borrowerCC.address);
  console.log(`[e2e] 5/10 credit limit: ${formatUnits(limit, 6)} tUSDC`);
  if (limit > 0n) {
    const borrowAmount = limit / 2n;
    const tx = await pool.borrow(borrowAmount);
    await tx.wait();
    console.log(`[e2e]     borrowed ${formatUnits(borrowAmount, 6)} tUSDC, tx: ${tx.hash}`);
  } else {
    console.log("[e2e]     credit limit is 0 (stream not vesting yet?), skipping borrow");
  }

  // 6. Wait for some real vesting time, then withdraw salary on Sepolia.
  console.log(`[e2e] 6/10 waiting ${VEST_WAIT_MS / 1000}s for salary to vest...`);
  await sleep(VEST_WAIT_MS);
  const vested: bigint = await stream.balanceOf(streamId);
  console.log(`[e2e]     vested balance: ${formatUnits(vested, 18)} ETH`);
  if (vested > 0n) {
    const streamAsBorrower = stream.connect(borrowerSepolia) as Contract;
    const wTx = await streamAsBorrower.withdraw(streamId, vested);
    const wReceipt = await wTx.wait();
    console.log(`[e2e]     withdrew, tx: ${wTx.hash}`);

    // 7. Relay SalaryStreamWithdrawn — this is what triggers garnishment.
    console.log("[e2e] 7/10 relaying SalaryStreamWithdrawn...");
    await relayEvent(
      chainInfoProvider,
      builder,
      sepolia.chainKey,
      asc,
      wTx.hash,
      wReceipt.blockNumber,
      "SalaryStreamWithdrawn",
    );
  } else {
    console.log("[e2e]     nothing vested yet, skipping withdraw + garnish steps");
  }

  // 8. Confirm garnishment froze borrowing, then settle it.
  const pendingGarnish: bigint = await pool.pendingGarnish(borrowerCC.address);
  console.log(`[e2e] 8/10 pendingGarnish: ${formatUnits(pendingGarnish, 6)} tUSDC`);
  if (pendingGarnish > 0n) {
    try {
      await pool.borrow.staticCall(1n);
      console.log("[e2e]     WARNING: borrow() did not revert despite pending garnish");
    } catch {
      console.log("[e2e]     confirmed: borrow() reverts while garnish is outstanding");
    }

    await ensureUsdcBalance(usdc, borrowerCC.address, pendingGarnish);
    const approveTx = await usdc.approve(poolAddress, pendingGarnish);
    await approveTx.wait();
    const settleTx = await pool.settleGarnish(pendingGarnish);
    await settleTx.wait();
    console.log(`[e2e]     settled garnish, tx: ${settleTx.hash}`);
  }

  // 9. Repay whatever debt remains in full, growing the borrower's credit tier.
  const debt: bigint = await pool.debt(borrowerCC.address);
  console.log(`[e2e] 9/10 remaining debt: ${formatUnits(debt, 6)} tUSDC`);
  if (debt > 0n) {
    await ensureUsdcBalance(usdc, borrowerCC.address, debt);
    const approveTx = await usdc.approve(poolAddress, debt);
    await approveTx.wait();
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

function parseStreamId(stream: Contract, receipt: { logs: Array<{ topics: readonly string[]; data: string }> }): bigint {
  for (const log of receipt.logs) {
    try {
      const parsed = stream.interface.parseLog({ topics: log.topics as string[], data: log.data });
      if (parsed?.name === "SalaryStreamCreated") return parsed.args.streamId as bigint;
    } catch {
      // not one of our events, skip
    }
  }
  throw new Error("SalaryStreamCreated log not found in create tx receipt");
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
