import "dotenv/config";
import { Contract } from "ethers";
import { SALARY_STREAM_ABI } from "@streamcredit/shared";
import {
  ATTESTATION_POLL_MS,
  ATTESTATION_TIMEOUT_MS,
  creditcoinProvider,
  makeChainInfoProvider,
  resolveSourceChainKey,
  sourceProvider,
} from "./chain.js";
import { makeHostedProofBuilder } from "./proof.js";
import { ascContract, submitProof } from "./submitter.js";
import { enqueue, pendingJobs, updateStatus } from "./store.js";
import type { proofProvider, chainInfo } from "@gluwa/usc-sdk";

/**
 * Entry point: listens for the three SalaryStream event types on Sepolia,
 * queues them, and drives each through attest-wait -> proof -> submit (§2.4).
 */
async function main() {
  const source = sourceProvider();
  const cc = creditcoinProvider();

  const streamAddress = requireEnv("STREAM_CONTRACT");
  const ascAddress = requireEnv("ASC_CONTRACT");
  const workerKey = requireEnv("WORKER_PRIVATE_KEY");
  const proverUrl = process.env.PROVER_URL ?? "https://prover.cc3-testnet.creditcoin.network";

  const chainInfoProvider = makeChainInfoProvider(cc);
  const sepolia = await resolveSourceChainKey(chainInfoProvider);
  const builder = makeHostedProofBuilder(sepolia.chainKey, proverUrl);
  const asc = ascContract(cc, ascAddress, workerKey);

  const streamContract = new Contract(streamAddress, SALARY_STREAM_ABI, source);

  streamContract.on("*", async (event) => {
    const txHash: string | undefined = event?.log?.transactionHash;
    const blockNumber: number | undefined = event?.log?.blockNumber;
    if (!txHash || blockNumber === undefined) return;

    await enqueue({ txHash, eventKind: "created", blockNumber });
    console.log(`[worker] queued ${txHash} @ block ${blockNumber}`);
  });

  console.log(`[worker] listening on ${streamAddress}, chainKey=${sepolia.chainKey}`);

  // Drain the persistent queue on a fixed interval so restarts pick up where they left off.
  setInterval(() => {
    void drainQueue(chainInfoProvider, builder, sepolia.chainKey, asc).catch((err) =>
      console.error("[worker] drain error", err),
    );
  }, 15_000);
}

export async function drainQueue(
  chainInfoProvider: chainInfo.ChainInfoProvider,
  builder: proofProvider.ProofProvider,
  chainKey: number,
  asc: Awaited<ReturnType<typeof ascContract>>,
) {
  const jobs = await pendingJobs();
  for (const job of jobs) {
    try {
      // waitUntilHeightAttested lives on ChainInfoProvider, not ProofProvider — RawProofBuilder
      // (the offline fallback) doesn't implement it, so this call must stay builder-agnostic.
      await chainInfoProvider.waitUntilHeightAttested(
        chainKey,
        job.blockNumber,
        ATTESTATION_POLL_MS,
        ATTESTATION_TIMEOUT_MS,
      );
      await updateStatus(job.txHash, "attested");

      const r = await builder.getProof(job.txHash);
      if (!r.success || !r.data) throw new Error(r.error ?? "proof unavailable");
      await updateStatus(job.txHash, "proven");

      await submitProof(asc, r.data);
      await updateStatus(job.txHash, "submitted");
      console.log(`[worker] submitted ${job.txHash}`);
    } catch (err) {
      await updateStatus(job.txHash, "failed", err instanceof Error ? err.message : String(err));
      console.error(`[worker] job ${job.txHash} failed`, err);
    }
  }
}

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`missing required env var: ${key}`);
  return v;
}

const isEntrypoint = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isEntrypoint) {
  main().catch((err) => {
    console.error("[worker] fatal", err);
    process.exit(1);
  });
}
