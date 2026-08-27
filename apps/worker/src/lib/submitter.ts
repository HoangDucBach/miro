import { Contract, NonceManager, Wallet, type JsonRpcProvider } from "ethers";
import { CREDIT_PASSPORT_ABI } from "@miro/shared";
import type { ProofData } from "./proof.js";

const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 5000;

/**
 * NonceManager matters once the queue runs jobs concurrently: two submitProof calls
 * racing on the same Wallet would both read the same "next nonce" and one tx would fail
 * or replace the other. NonceManager serializes nonce assignment while still letting the
 * RPC calls for everything else (attest-wait, proof fetch) run in parallel.
 */
export function passportContract(cc: JsonRpcProvider, passportAddress: string, workerKey: string): Contract {
  const wallet = new Wallet(workerKey, cc);
  return new Contract(passportAddress, CREDIT_PASSPORT_ABI, new NonceManager(wallet));
}

/** Submits a proof to CreditPassport.processAttestation, with retry on transient failures. */
export async function submitProof(passport: Contract, proof: ProofData): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const tx = await passport.processAttestation(
        proof.chainKey,
        proof.headerNumber,
        proof.txBytes,
        proof.merkleProof.root,
        proof.merkleProof.siblings,
        proof.continuityProof.lowerEndpointDigest,
        proof.continuityProof.roots,
      );
      const receipt = await tx.wait();
      return receipt.hash as string;
    } catch (err) {
      lastErr = err;
      if (isAlreadyProcessed(err)) {
        // Not an error from our side — another worker instance beat us to it (§1.6 replay).
        return "already-processed";
      }
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_BACKOFF_MS * attempt);
      }
    }
  }
  throw lastErr;
}

function isAlreadyProcessed(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("already processed");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
