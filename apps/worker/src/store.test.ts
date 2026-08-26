import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type * as StoreModule from "./store.js";

let tmpDir: string;
const ORIGINAL_ENV = { ...process.env };

// store.ts caches its DB path and connection at module load time, so each test needs a
// fresh module instance pointed at its own temp file to stay isolated from the others.
async function freshStore(): Promise<typeof StoreModule> {
  tmpDir = mkdtempSync(path.join(tmpdir(), "worker-store-test-"));
  process.env.WORKER_DB_PATH = path.join(tmpDir, "jobs.json");
  vi.resetModules();
  return import("./store.js");
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe("enqueue", () => {
  it("adds a new job with pending status and zero attempts", async () => {
    const store = await freshStore();
    await store.enqueue({ txHash: "0xabc", eventKind: "created", blockNumber: 100 });

    const jobs = await store.pendingJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      txHash: "0xabc",
      eventKind: "created",
      blockNumber: 100,
      status: "pending",
      attempts: 0,
    });
    expect(jobs[0].createdAt).toBeTypeOf("number");
  });

  it("is a no-op if the same txHash is enqueued twice", async () => {
    const store = await freshStore();
    await store.enqueue({ txHash: "0xabc", eventKind: "created", blockNumber: 100 });
    await store.enqueue({ txHash: "0xabc", eventKind: "created", blockNumber: 999 });

    const jobs = await store.pendingJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].blockNumber).toBe(100); // first enqueue wins, second is ignored
  });

  it("persists to disk, so a fresh module instance pointed at the same file sees it too", async () => {
    const store = await freshStore();
    await store.enqueue({ txHash: "0xabc", eventKind: "created", blockNumber: 100 });

    // process.env.WORKER_DB_PATH is unchanged, so this second import (forced past the
    // module cache) reads the same file the first instance just wrote to.
    vi.resetModules();
    const reloaded: typeof StoreModule = await import("./store.js");
    const jobs = await reloaded.pendingJobs();
    expect(jobs.some((j) => j.txHash === "0xabc")).toBe(true);
  });
});

describe("updateStatus", () => {
  it("updates the status and bumps updatedAt", async () => {
    const store = await freshStore();
    await store.enqueue({ txHash: "0xabc", eventKind: "created", blockNumber: 100 });
    const before = (await store.pendingJobs())[0].updatedAt;

    await new Promise((r) => setTimeout(r, 2));
    await store.updateStatus("0xabc", "attested");

    const jobs = await store.pendingJobs();
    expect(jobs[0].status).toBe("attested");
    expect(jobs[0].updatedAt).toBeGreaterThanOrEqual(before);
  });

  it("increments attempts and records lastError only on failed status", async () => {
    const store = await freshStore();
    await store.enqueue({ txHash: "0xabc", eventKind: "created", blockNumber: 100 });

    await store.updateStatus("0xabc", "attested");
    let jobs = await store.pendingJobs();
    expect(jobs[0].attempts).toBe(0);
    expect(jobs[0].lastError).toBeUndefined();

    await store.updateStatus("0xabc", "failed", "prover unreachable");
    jobs = await store.pendingJobs();
    expect(jobs[0].attempts).toBe(1);
    expect(jobs[0].lastError).toBe("prover unreachable");
  });

  it("throws for an unknown txHash", async () => {
    const store = await freshStore();
    await expect(store.updateStatus("0xnonexistent", "attested")).rejects.toThrow("unknown job: 0xnonexistent");
  });
});

describe("pendingJobs", () => {
  it("excludes jobs marked submitted", async () => {
    const store = await freshStore();
    await store.enqueue({ txHash: "0xabc", eventKind: "created", blockNumber: 100 });
    await store.enqueue({ txHash: "0xdef", eventKind: "withdrawn", blockNumber: 101 });

    await store.updateStatus("0xabc", "submitted");

    const jobs = await store.pendingJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].txHash).toBe("0xdef");
  });

  it("includes failed jobs so they can be retried on the next drain", async () => {
    const store = await freshStore();
    await store.enqueue({ txHash: "0xabc", eventKind: "created", blockNumber: 100 });
    await store.updateStatus("0xabc", "failed", "boom");

    const jobs = await store.pendingJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe("failed");
  });

  it("returns an empty list for a brand new DB", async () => {
    const store = await freshStore();
    expect(await store.pendingJobs()).toEqual([]);
  });
});
