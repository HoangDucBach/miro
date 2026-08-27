import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { chainInfo, proofProvider } from "@gluwa/usc-sdk";
import type { Job, RelayJobData } from "./lib/queue.js";
import { ATTESTATION_POLL_MS, ATTESTATION_TIMEOUT_MS } from "./lib/chain.js";

const submitProofMock = vi.fn();
vi.mock("./lib/submitter.js", () => ({
  passportContract: vi.fn(),
  submitProof: submitProofMock,
}));

const { processRelayJob, watchTargetsFromEnv } = await import("./index.js");

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
    const passport = { fake: "passport" };

    await processRelayJob(job, chainInfoProvider, builder, 1, passport as never);

    expect(waitUntilHeightAttested).toHaveBeenCalledWith(1, 100, ATTESTATION_POLL_MS, ATTESTATION_TIMEOUT_MS);
    expect(getProof).toHaveBeenCalledWith("0xabc");
    expect(submitProofMock).toHaveBeenCalledWith(passport, proofData);
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

describe("watchTargetsFromEnv", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.AAVE_POOL_CONTRACT;
    delete process.env.MORPHO_CONTRACT;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("builds a target per configured source, in a stable order", () => {
    process.env.AAVE_POOL_CONTRACT = "0xaave";
    process.env.MORPHO_CONTRACT = "0xmorpho";

    const targets = watchTargetsFromEnv();

    expect(targets).toHaveLength(2);
    expect(targets[0]).toMatchObject({ label: "Aave Repay", address: "0xaave" });
    expect(targets[1]).toMatchObject({ label: "Morpho Repay", address: "0xmorpho" });
  });

  it("supports a single configured source", () => {
    process.env.AAVE_POOL_CONTRACT = "0xaave";

    const targets = watchTargetsFromEnv();

    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({ label: "Aave Repay", address: "0xaave" });
  });

  it("throws when no source is configured, since the worker would otherwise listen for nothing", () => {
    expect(() => watchTargetsFromEnv()).toThrow(/no watch targets configured/);
  });
});
