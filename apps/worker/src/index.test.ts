import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ProofJob } from "@streamcredit/shared";
import type { chainInfo, proofProvider } from "@gluwa/usc-sdk";
import { ATTESTATION_POLL_MS, ATTESTATION_TIMEOUT_MS } from "./chain.js";

const pendingJobsMock = vi.fn();
const updateStatusMock = vi.fn();
vi.mock("./store.js", () => ({
  pendingJobs: pendingJobsMock,
  updateStatus: updateStatusMock,
  enqueue: vi.fn(),
}));

const submitProofMock = vi.fn();
vi.mock("./submitter.js", () => ({
  ascContract: vi.fn(),
  submitProof: submitProofMock,
}));

const { drainQueue } = await import("./index.js");

function job(overrides: Partial<ProofJob> = {}): ProofJob {
  return {
    txHash: "0xabc",
    eventKind: "created",
    blockNumber: 100,
    status: "pending",
    attempts: 0,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("drainQueue", () => {
  beforeEach(() => {
    pendingJobsMock.mockReset();
    updateStatusMock.mockReset();
    submitProofMock.mockReset();
  });

  it("does nothing when there are no pending jobs", async () => {
    pendingJobsMock.mockResolvedValue([]);
    const chainInfoProvider = { waitUntilHeightAttested: vi.fn() } as unknown as chainInfo.ChainInfoProvider;
    const builder = { getProof: vi.fn() } as unknown as proofProvider.ProofProvider;

    await drainQueue(chainInfoProvider, builder, 1, {} as never);

    expect(chainInfoProvider.waitUntilHeightAttested).not.toHaveBeenCalled();
    expect(builder.getProof).not.toHaveBeenCalled();
    expect(updateStatusMock).not.toHaveBeenCalled();
  });

  it("moves a job through attested -> proven -> submitted on the happy path", async () => {
    pendingJobsMock.mockResolvedValue([job()]);
    const waitUntilHeightAttested = vi.fn().mockResolvedValue(undefined);
    const chainInfoProvider = { waitUntilHeightAttested } as unknown as chainInfo.ChainInfoProvider;
    const proofData = { chainKey: 1, headerNumber: 100 };
    const getProof = vi.fn().mockResolvedValue({ success: true, data: proofData });
    const builder = { getProof } as unknown as proofProvider.ProofProvider;
    submitProofMock.mockResolvedValue("0xreceipt");
    const asc = { fake: "asc" };

    await drainQueue(chainInfoProvider, builder, 1, asc as never);

    // Regression test: ChainInfoProvider.waitUntilHeightAttested defaults to a 60s
    // timeout, far shorter than real testnet attestation latency (verified against a
    // live run that timed out). drainQueue must always pass explicit longer values.
    expect(waitUntilHeightAttested).toHaveBeenCalledWith(1, 100, ATTESTATION_POLL_MS, ATTESTATION_TIMEOUT_MS);
    expect(ATTESTATION_TIMEOUT_MS).toBeGreaterThan(60_000);
    expect(getProof).toHaveBeenCalledWith("0xabc");
    expect(submitProofMock).toHaveBeenCalledWith(asc, proofData);

    expect(updateStatusMock.mock.calls.map((c) => c[1])).toEqual(["attested", "proven", "submitted"]);
  });

  it("processes multiple jobs independently, in order", async () => {
    pendingJobsMock.mockResolvedValue([job({ txHash: "0x1" }), job({ txHash: "0x2", blockNumber: 200 })]);
    const chainInfoProvider = {
      waitUntilHeightAttested: vi.fn().mockResolvedValue(undefined),
    } as unknown as chainInfo.ChainInfoProvider;
    const builder = {
      getProof: vi.fn().mockResolvedValue({ success: true, data: {} }),
    } as unknown as proofProvider.ProofProvider;
    submitProofMock.mockResolvedValue("0xreceipt");

    await drainQueue(chainInfoProvider, builder, 1, {} as never);

    expect(builder.getProof).toHaveBeenCalledWith("0x1");
    expect(builder.getProof).toHaveBeenCalledWith("0x2");
    expect(updateStatusMock.mock.calls.filter((c) => c[1] === "submitted")).toHaveLength(2);
  });

  it("marks the job failed and continues when getProof reports failure", async () => {
    pendingJobsMock.mockResolvedValue([job({ txHash: "0x1" }), job({ txHash: "0x2" })]);
    const chainInfoProvider = {
      waitUntilHeightAttested: vi.fn().mockResolvedValue(undefined),
    } as unknown as chainInfo.ChainInfoProvider;
    const getProof = vi
      .fn()
      .mockResolvedValueOnce({ success: false, error: "prover down" })
      .mockResolvedValueOnce({ success: true, data: {} });
    const builder = { getProof } as unknown as proofProvider.ProofProvider;
    submitProofMock.mockResolvedValue("0xreceipt");

    await drainQueue(chainInfoProvider, builder, 1, {} as never);

    expect(updateStatusMock).toHaveBeenCalledWith("0x1", "failed", "prover down");
    // second job still gets processed despite the first one failing
    expect(updateStatusMock).toHaveBeenCalledWith("0x2", "submitted");
  });

  it("marks the job failed when waitUntilHeightAttested throws, without touching other jobs", async () => {
    pendingJobsMock.mockResolvedValue([job({ txHash: "0x1" }), job({ txHash: "0x2" })]);
    const waitUntilHeightAttested = vi
      .fn()
      .mockRejectedValueOnce(new Error("attestation timeout"))
      .mockResolvedValueOnce(undefined);
    const chainInfoProvider = { waitUntilHeightAttested } as unknown as chainInfo.ChainInfoProvider;
    const builder = {
      getProof: vi.fn().mockResolvedValue({ success: true, data: {} }),
    } as unknown as proofProvider.ProofProvider;
    submitProofMock.mockResolvedValue("0xreceipt");

    await drainQueue(chainInfoProvider, builder, 1, {} as never);

    expect(updateStatusMock).toHaveBeenCalledWith("0x1", "failed", "attestation timeout");
    expect(updateStatusMock).toHaveBeenCalledWith("0x2", "submitted");
  });

  it("marks the job failed when submitProof throws", async () => {
    pendingJobsMock.mockResolvedValue([job()]);
    const chainInfoProvider = {
      waitUntilHeightAttested: vi.fn().mockResolvedValue(undefined),
    } as unknown as chainInfo.ChainInfoProvider;
    const builder = {
      getProof: vi.fn().mockResolvedValue({ success: true, data: {} }),
    } as unknown as proofProvider.ProofProvider;
    submitProofMock.mockRejectedValue(new Error("submit failed"));

    await drainQueue(chainInfoProvider, builder, 1, {} as never);

    expect(updateStatusMock).toHaveBeenCalledWith("0xabc", "failed", "submit failed");
    expect(updateStatusMock).not.toHaveBeenCalledWith("0xabc", "submitted");
  });
});
