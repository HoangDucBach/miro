import { Queue, Worker, type Job, type Processor } from "bullmq";
import IORedis from "ioredis";

export const RELAY_QUEUE_NAME = "stream-relay";

export interface RelayJobData {
  txHash: string;
  eventKind: "created" | "withdrawn" | "cancelled";
  blockNumber: number;
}

/** BullMQ requires this on the connection it manages, or its blocking commands break. */
export function createRedisConnection(url?: string): IORedis {
  return new IORedis(url ?? process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });
}

export function createRelayQueue(connection: IORedis): Queue<RelayJobData> {
  return new Queue<RelayJobData>(RELAY_QUEUE_NAME, { connection });
}

/**
 * jobId: txHash gives free deduplication — adding the same txHash again while a job is
 * still waiting/active/delayed is a no-op instead of a duplicate. attempts/backoff replace
 * the manual per-job retry loop the old lowdb-based queue needed.
 */
export async function enqueueRelayJob(queue: Queue<RelayJobData>, data: RelayJobData): Promise<void> {
  await queue.add(data.eventKind, data, {
    jobId: data.txHash,
    attempts: 10,
    backoff: { type: "exponential", delay: 15_000 },
  });
}

export function createRelayWorker(
  connection: IORedis,
  processor: Processor<RelayJobData>,
  concurrency: number,
): Worker<RelayJobData> {
  return new Worker<RelayJobData>(RELAY_QUEUE_NAME, processor, { connection, concurrency });
}

export type { Job };
