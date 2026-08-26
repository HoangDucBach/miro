import "dotenv/config";
import { Contract } from "ethers";
import { SALARY_STREAM_ABI } from "@miro/shared";
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
import { createRedisConnection, createRelayQueue, createRelayWorker, enqueueRelayJob } from "./lib/queue.js";
import type { Job, RelayJobData } from "./lib/queue.js";
import type { proofProvider, chainInfo } from "@gluwa/usc-sdk";

/**
 * Entry point: listens for the three SalaryStream event types on Sepolia, pushes each
 * onto a BullMQ queue (Redis-backed, so restarts don't drop events and multiple worker
 * processes can share the same queue), and a concurrent Worker drives each job through
 * attest-wait -> proof -> submit.
 */
async function main() {
  const source = sourceProvider();
  const cc = creditcoinProvider();

  const streamAddress = requireEnv("STREAM_CONTRACT");
  const ascAddress = requireEnv("ASC_CONTRACT");
  const workerKey = requireEnv("WORKER_PRIVATE_KEY");
  const proverUrl = process.env.PROVER_URL ?? "https://prover.cc3-testnet.creditcoin.network";
  const concurrency = Number(process.env.WORKER_CONCURRENCY ?? "5");

  const chainInfoProvider = makeChainInfoProvider(cc);
  const sepolia = await resolveSourceChainKey(chainInfoProvider);
  const builder = makeHostedProofBuilder(sepolia.chainKey, proverUrl);
  const asc = ascContract(cc, ascAddress, workerKey);

  // BullMQ wants the Queue (producer) and Worker (consumer) on separate connections.
  const queue = createRelayQueue(createRedisConnection());
  const worker = createRelayWorker(
    createRedisConnection(),
    (job) => processRelayJob(job, chainInfoProvider, builder, sepolia.chainKey, asc),
    concurrency,
  );
  worker.on("completed", (job) => console.log(`[worker] job ${job.id} (${job.data.txHash}) completed`));
  worker.on("failed", (job, err) =>
    console.error(`[worker] job ${job?.id} (${job?.data.txHash}) failed`, err.message),
  );

  const streamContract = new Contract(streamAddress, SALARY_STREAM_ABI, source);

  streamContract.on("*", async (event) => {
    const txHash: string | undefined = event?.log?.transactionHash;
    const blockNumber: number | undefined = event?.log?.blockNumber;
    if (!txHash || blockNumber === undefined) return;

    await enqueueRelayJob(queue, { txHash, eventKind: "created", blockNumber });
    console.log(`[worker] queued ${txHash} @ block ${blockNumber}`);
  });

  console.log(
    `[worker] listening on ${streamAddress}, chainKey=${sepolia.chainKey}, concurrency=${concurrency}`,
  );
}

/**
 * waitUntilHeightAttested lives on ChainInfoProvider, not ProofProvider — RawProofBuilder
 * (the offline fallback) doesn't implement it, so this stays builder-agnostic.
 */
export async function processRelayJob(
  job: Job<RelayJobData>,
  chainInfoProvider: chainInfo.ChainInfoProvider,
  builder: proofProvider.ProofProvider,
  chainKey: number,
  asc: Awaited<ReturnType<typeof ascContract>>,
): Promise<void> {
  const { txHash, blockNumber } = job.data;

  await chainInfoProvider.waitUntilHeightAttested(chainKey, blockNumber, ATTESTATION_POLL_MS, ATTESTATION_TIMEOUT_MS);
  await job.updateProgress("attested");

  const r = await builder.getProof(txHash);
  if (!r.success || !r.data) throw new Error(r.error ?? "proof unavailable");
  await job.updateProgress("proven");

  const result = await submitProof(asc, r.data);
  await job.updateProgress("submitted");
  console.log(`[worker] submitted ${txHash}: ${result}`);
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
