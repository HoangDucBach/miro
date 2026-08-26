import { JsonRpcProvider } from "ethers";
import { chainInfo, proofProvider } from "@gluwa/usc-sdk";

export type ProofProvider = proofProvider.ProofProvider;
export type ProofResult = proofProvider.ProofResult;
/** The actual proof payload inside a successful ProofResult (`result.data`). */
export type ProofData = proofProvider.ContinuityResponse;

/** Hosted proof builder — recommended default (§2.1). Also exposes waitUntilHeightAttested. */
export function makeHostedProofBuilder(chainKey: number, proverUrl: string): proofProvider.service.ProofBuilder {
  return new proofProvider.service.ProofBuilder(chainKey, proverUrl);
}

/**
 * Local fallback with the SAME ProofProvider interface (getProof / getBatchProof) — swap in
 * if the hosted Prover API is down (§1.6 "Prover API downtime" risk, §2.4 stretch goal).
 * NOTE: unlike ProofBuilder, RawProofBuilder does NOT implement waitUntilHeightAttested —
 * callers must use the shared ChainInfoProvider for that regardless of which builder is active
 * (see apps/worker/src/chain.ts makeChainInfoProvider).
 */
export function makeRawProofBuilder(
  chainKey: number,
  source: JsonRpcProvider,
  chainInfoProvider: chainInfo.ChainInfoProvider,
): proofProvider.raw.RawProofBuilder {
  const blockProvider = new proofProvider.raw.blockProvider.SimpleBlockProvider(source);
  return new proofProvider.raw.RawProofBuilder(
    chainKey,
    blockProvider,
    chainInfoProvider,
    proofProvider.raw.EncodingVersion.V1,
  );
}

/**
 * Batch mode: up to 10 tx sharing one continuity proof, within a 1000-block span (§2.1 stretch).
 */
export async function getBatchProof(
  builder: proofProvider.ProofProvider,
  txHashes: string[],
): Promise<proofProvider.BatchContinuityResponse> {
  if (txHashes.length > 10) throw new Error("batch proof supports at most 10 tx");
  const r = await builder.getBatchProof(txHashes);
  if (!r.success || !r.data) throw new Error(r.error ?? "batch proof failed");
  return r.data;
}
