import { describe, it, expect, vi } from "vitest";
import type { Queue } from "bullmq";
import { enqueueRelayJob, type RelayJobData } from "./queue.js";

describe("enqueueRelayJob", () => {
  it("adds the job keyed by txHash, with retry/backoff configured", async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const queue = { add } as unknown as Queue<RelayJobData>;
    const data: RelayJobData = { txHash: "0xabc", eventKind: "created", blockNumber: 100 };

    await enqueueRelayJob(queue, data);

    expect(add).toHaveBeenCalledWith("created", data, {
      jobId: "0xabc",
      attempts: 10,
      backoff: { type: "exponential", delay: 15_000 },
    });
  });
});
