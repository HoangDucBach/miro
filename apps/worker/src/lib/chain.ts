import "dotenv/config";
import { JsonRpcProvider } from "ethers";
import { chainInfo } from "@gluwa/usc-sdk";

export const SEPOLIA_EVM_CHAIN_ID = 11155111;

/**
 * ChainInfoProvider.waitUntilHeightAttested defaults to a 60s timeout (5s poll), far
 * shorter than ProofBuilder's own waitUntilHeightAttested (15s poll / 15min timeout).
 * Real testnet attestation can lag more than 60s behind head, so every caller here uses
 * these instead of the short default — verified against a live run that timed out at 60s.
 */
export const ATTESTATION_POLL_MS = 15_000;
export const ATTESTATION_TIMEOUT_MS = 15 * 60_000;

export function sourceProvider(): JsonRpcProvider {
  const rpc = requireEnv("SEPOLIA_RPC");
  return new JsonRpcProvider(rpc);
}

export function creditcoinProvider(): JsonRpcProvider {
  return new JsonRpcProvider(process.env.CC3_RPC ?? "https://rpc.cc3-testnet.creditcoin.network");
}

/**
 * One shared ChainInfoProvider instance per process. Both the hosted ProofBuilder path and
 * the RawProofBuilder fallback need `waitUntilHeightAttested` — only ChainInfoProvider
 * guarantees it (RawProofBuilder does not implement it, only getProof/getBatchProof per the
 * ProofProvider interface in @gluwa/usc-sdk@0.18.0's proof-provider/index.ts).
 */
export function makeChainInfoProvider(cc: JsonRpcProvider): chainInfo.PrecompileChainInfoProvider {
  return new chainInfo.PrecompileChainInfoProvider(cc);
}

/**
 * Resolve Sepolia's Creditcoin-internal chainKey at runtime — never hardcode it,
 * since chainKey is NOT the EVM chainId (§2.1 / §2.4).
 */
export async function resolveSourceChainKey(info: chainInfo.ChainInfoProvider): Promise<chainInfo.ChainInfo> {
  const chains = await info.getSupportedChains();
  const sepolia = chains.find((c) => c.chainId === SEPOLIA_EVM_CHAIN_ID);
  if (!sepolia) {
    throw new Error("Sepolia not found in supported chains — check CC3 RPC / precompile config");
  }
  return sepolia;
}

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`missing required env var: ${key}`);
  return v;
}
