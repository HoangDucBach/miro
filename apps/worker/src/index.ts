import "dotenv/config";
import type { Contract, JsonRpcProvider } from "ethers";
import { EVENT_TOPICS } from "@miro/shared";
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
import { createRedisConnection, createRelayQueue, createRelayWorker, enqueueRelayJob } from "./lib/queue.js";
import type { Job, RelayJobData } from "./lib/queue.js";
import type { Queue } from "bullmq";
import type { proofProvider, chainInfo } from "@gluwa/usc-sdk";

/** One (emitter, topic) pair to watch on Sepolia. Adding a new source protocol later is
 *  just another entry here plus a matching CreditPassport.setSource(...) registration --
 *  nothing about the listener code itself is specific to Aave or Morpho. */
interface WatchTarget {
  label: string;
  address: string;
  topic0: string;
}

export function watchTargetsFromEnv(): WatchTarget[] {
  const targets: WatchTarget[] = [];
  const aavePool = process.env.AAVE_POOL_CONTRACT;
  if (aavePool) targets.push({ label: "Aave Repay", address: aavePool, topic0: EVENT_TOPICS.AaveRepay });
  const morpho = process.env.MORPHO_CONTRACT;
  if (morpho) targets.push({ label: "Morpho Repay", address: morpho, topic0: EVENT_TOPICS.MorphoRepay });
  if (targets.length === 0) throw new Error("no watch targets configured: set AAVE_POOL_CONTRACT and/or MORPHO_CONTRACT");
  return targets;
}

/**
 * Entry point: listens for repayment events on each configured Sepolia lending protocol
 * (real, third-party contracts, not ours), pushes each onto a BullMQ queue (Redis-backed,
 * so restarts don't drop events and multiple worker processes can share the same queue),
 * and a concurrent Worker drives each job through attest-wait -> proof -> submit.
 */
async function main() {
  const source = sourceProvider();
  const cc = creditcoinProvider();

  const passportAddress = requireEnv("CREDIT_PASSPORT_CONTRACT");
  const workerKey = requireEnv("WORKER_PRIVATE_KEY");
  const proverUrl = process.env.PROVER_URL ?? "https://prover.cc3-testnet.creditcoin.network";
  const concurrency = Number(process.env.WORKER_CONCURRENCY ?? "5");

  const chainInfoProvider = makeChainInfoProvider(cc);
  const sepolia = await resolveSourceChainKey(chainInfoProvider);
  const builder = makeHostedProofBuilder(sepolia.chainKey, proverUrl);
  const passport = passportContract(cc, passportAddress, workerKey);

  // BullMQ wants the Queue (producer) and Worker (consumer) on separate connections.
  const queue = createRelayQueue(createRedisConnection());
  const worker = createRelayWorker(
    createRedisConnection(),
    (job) => processRelayJob(job, chainInfoProvider, builder, sepolia.chainKey, passport),
    concurrency,
  );
  worker.on("completed", (job) => console.log(`[worker] job ${job.id} (${job.data.txHash}) completed`));
  worker.on("failed", (job, err) =>
    console.error(`[worker] job ${job?.id} (${job?.data.txHash}) failed`, err.message),
  );

  const targets = watchTargetsFromEnv();
  for (const target of targets) {
    watchTarget(source, target, queue);
  }

  console.log(
    `[worker] listening on ${targets.map((t) => `${t.label} (${t.address})`).join(", ")}, chainKey=${sepolia.chainKey}, concurrency=${concurrency}`,
  );
}

function watchTarget(source: JsonRpcProvider, target: WatchTarget, queue: Queue<RelayJobData>): void {
  source.on({ address: target.address, topics: [target.topic0] }, async (log) => {
    const txHash: string | undefined = log?.transactionHash;
    const blockNumber: number | undefined = log?.blockNumber;
    if (!txHash || blockNumber === undefined) return;

    await enqueueRelayJob(queue, { txHash, eventKind: "created", blockNumber });
    console.log(`[worker] queued ${target.label} ${txHash} @ block ${blockNumber}`);
  });
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
  passport: Contract,
): Promise<void> {
  const { txHash, blockNumber } = job.data;

  await chainInfoProvider.waitUntilHeightAttested(chainKey, blockNumber, ATTESTATION_POLL_MS, ATTESTATION_TIMEOUT_MS);
  await job.updateProgress("attested");

  const r = await builder.getProof(txHash);
  if (!r.success || !r.data) throw new Error(r.error ?? "proof unavailable");
  await job.updateProgress("proven");

  const result = await submitProof(passport, r.data);
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
