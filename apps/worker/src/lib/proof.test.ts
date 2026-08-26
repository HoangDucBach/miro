import { describe, it, expect, vi } from "vitest";
import { JsonRpcProvider } from "ethers";
import { chainInfo, proofProvider } from "@gluwa/usc-sdk";
import { getBatchProof, makeHostedProofBuilder, makeRawProofBuilder } from "./proof.js";

describe("makeHostedProofBuilder", () => {
  it("builds a service.ProofBuilder wired to the given chainKey and prover URL", () => {
    const builder = makeHostedProofBuilder(1, "https://prover.example.test");
    expect(builder).toBeInstanceOf(proofProvider.service.ProofBuilder);
  });
});

describe("makeRawProofBuilder", () => {
  it("builds a raw.RawProofBuilder from a source provider and chain info provider", () => {
    const source = new JsonRpcProvider("https://example-sepolia-rpc.test");
    const cc = new JsonRpcProvider("https://example-cc3-rpc.test");
    const info = new chainInfo.PrecompileChainInfoProvider(cc);

    const builder = makeRawProofBuilder(1, source, info);
    expect(builder).toBeInstanceOf(proofProvider.raw.RawProofBuilder);
  });
});

describe("getBatchProof", () => {
  it("rejects more than 10 tx hashes before ever calling the builder", async () => {
    const builder = { getBatchProof: vi.fn() } as unknown as proofProvider.ProofProvider;
    const hashes = Array.from({ length: 11 }, (_, i) => `0x${i}`);

    await expect(getBatchProof(builder, hashes)).rejects.toThrow("batch proof supports at most 10 tx");
    expect(builder.getBatchProof).not.toHaveBeenCalled();
  });

  it("returns data on success", async () => {
    const fakeData = { chainKey: 1, fromHeader: 1, toHeader: 2 } as unknown as proofProvider.BatchContinuityResponse;
    const builder = {
      getBatchProof: vi.fn().mockResolvedValue({ success: true, data: fakeData }),
    } as unknown as proofProvider.ProofProvider;

    const result = await getBatchProof(builder, ["0xabc"]);
    expect(result).toBe(fakeData);
  });

  it("throws the provider's error message on failure", async () => {
    const builder = {
      getBatchProof: vi.fn().mockResolvedValue({ success: false, error: "prover unreachable" }),
    } as unknown as proofProvider.ProofProvider;

    await expect(getBatchProof(builder, ["0xabc"])).rejects.toThrow("prover unreachable");
  });

  it("throws a generic message when success is false but no error is given", async () => {
    const builder = {
      getBatchProof: vi.fn().mockResolvedValue({ success: false }),
    } as unknown as proofProvider.ProofProvider;

    await expect(getBatchProof(builder, ["0xabc"])).rejects.toThrow("batch proof failed");
  });

  it("throws when success is true but data is missing", async () => {
    const builder = {
      getBatchProof: vi.fn().mockResolvedValue({ success: true, data: undefined }),
    } as unknown as proofProvider.ProofProvider;

    await expect(getBatchProof(builder, ["0xabc"])).rejects.toThrow("batch proof failed");
  });
});
