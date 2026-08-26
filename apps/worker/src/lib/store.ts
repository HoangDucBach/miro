import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import path from "node:path";
import type { ProofJob, ProofJobStatus } from "@streamcredit/shared";

/**
 * Tiny persistent job queue so worker restarts don't drop events (§1.6 / §2.4).
 * Idempotent regardless: the ASC rejects replays via processedQueries(txKey).
 */
interface DbShape {
  jobs: Record<string, ProofJob>; // keyed by txHash
}

const DB_PATH = process.env.WORKER_DB_PATH ?? path.join(process.cwd(), ".data", "jobs.json");

let dbPromise: Promise<Low<DbShape>> | null = null;

async function getDb(): Promise<Low<DbShape>> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = new Low<DbShape>(new JSONFile(DB_PATH), { jobs: {} });
      await db.read();
      db.data ??= { jobs: {} };
      return db;
    })();
  }
  return dbPromise;
}

export async function enqueue(job: Omit<ProofJob, "status" | "attempts" | "createdAt" | "updatedAt">): Promise<void> {
  const db = await getDb();
  if (db.data.jobs[job.txHash]) return; // already queued
  const now = Date.now();
  db.data.jobs[job.txHash] = { ...job, status: "pending", attempts: 0, createdAt: now, updatedAt: now };
  await db.write();
}

export async function updateStatus(txHash: string, status: ProofJobStatus, error?: string): Promise<void> {
  const db = await getDb();
  const job = db.data.jobs[txHash];
  if (!job) throw new Error(`unknown job: ${txHash}`);
  job.status = status;
  job.updatedAt = Date.now();
  if (status === "failed") {
    job.attempts += 1;
    job.lastError = error;
  }
  await db.write();
}

export async function pendingJobs(): Promise<ProofJob[]> {
  const db = await getDb();
  return Object.values(db.data.jobs).filter((j) => j.status !== "submitted");
}
