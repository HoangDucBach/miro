import { describe, it, expect, vi, beforeEach } from "vitest";
import type { chainInfo, proofProvider } from "@gluwa/usc-sdk";
import type { Job, RelayJobData } from "./lib/queue.js";
import { ATTESTATION_POLL_MS, ATTESTATION_TIMEOUT_MS } from "./lib/chain.js";

const submitProofMock = vi.fn();
vi.mock("./lib/submitter.js", () => ({
  ascContract: vi.fn(),
  submitProof: submitProofMock,
}));

const { processRelayJob } = await import("./index.js");

function fakeJob(data: RelayJobData, updateProgress = vi.fn()): Job<RelayJobData> {
  return { data, updateProgress } as unknown as Job<RelayJobData>;
}

describe("processRelayJob", () => {
  beforeEach(() => {
    submitProofMock.mockReset();
  });

  it("moves through attested -> proven -> submitted on the happy path", async () => {
    const updateProgress = vi.fn();
    const job = fakeJob({ txHash: "0xabc", eventKind: "created", blockNumber: 100 }, updateProgress);

    const waitUntilHeightAttested = vi.fn().mockResolvedValue(undefined);
    const chainInfoProvider = { waitUntilHeightAttested } as unknown as chainInfo.ChainInfoProvider;
    const proofData = { chainKey: 1, headerNumber: 100 };
    const getProof = vi.fn().mockResolvedValue({ success: true, data: proofData });
    const builder = { getProof } as unknown as proofProvider.ProofProvider;
    submitProofMock.mockResolvedValue("0xreceipt");
    const asc = { fake: "asc" };

    await processRelayJob(job, chainInfoProvider, builder, 1, asc as never);

    expect(waitUntilHeightAttested).toHaveBeenCalledWith(1, 100, ATTESTATION_POLL_MS, ATTESTATION_TIMEOUT_MS);
    expect(getProof).toHaveBeenCalledWith("0xabc");
    expect(submitProofMock).toHaveBeenCalledWith(asc, proofData);
    expect(updateProgress.mock.calls.map((c) => c[0])).toEqual(["attested", "proven", "submitted"]);
  });

  it("propagates a getProof failure so BullMQ can retry the job", async () => {
    const job = fakeJob({ txHash: "0xabc", eventKind: "created", blockNumber: 100 });
    const chainInfoProvider = {
      waitUntilHeightAttested: vi.fn().mockResolvedValue(undefined),
    } as unknown as chainInfo.ChainInfoProvider;
    const builder = {
      getProof: vi.fn().mockResolvedValue({ success: false, error: "prover down" }),
    } as unknown as proofProvider.ProofProvider;

    await expect(processRelayJob(job, chainInfoProvider, builder, 1, {} as never)).rejects.toThrow("prover down");
    expect(submitProofMock).not.toHaveBeenCalled();
  });

  it("propagates a waitUntilHeightAttested failure so BullMQ can retry the job", async () => {
    const job = fakeJob({ txHash: "0xabc", eventKind: "created", blockNumber: 100 });
    const chainInfoProvider = {
      waitUntilHeightAttested: vi.fn().mockRejectedValue(new Error("attestation timeout")),
    } as unknown as chainInfo.ChainInfoProvider;
    const builder = { getProof: vi.fn() } as unknown as proofProvider.ProofProvider;

    await expect(processRelayJob(job, chainInfoProvider, builder, 1, {} as never)).rejects.toThrow(
      "attestation timeout",
    );
    expect(builder.getProof).not.toHaveBeenCalled();
  });

  it("propagates a submitProof failure so BullMQ can retry the job", async () => {
    const job = fakeJob({ txHash: "0xabc", eventKind: "created", blockNumber: 100 });
    const chainInfoProvider = {
      waitUntilHeightAttested: vi.fn().mockResolvedValue(undefined),
    } as unknown as chainInfo.ChainInfoProvider;
    const builder = {
      getProof: vi.fn().mockResolvedValue({ success: true, data: {} }),
    } as unknown as proofProvider.ProofProvider;
    submitProofMock.mockRejectedValue(new Error("rpc down"));

    await expect(processRelayJob(job, chainInfoProvider, builder, 1, {} as never)).rejects.toThrow("rpc down");
  });
});
