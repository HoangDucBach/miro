import { id as keccakId } from "ethers";

/** Human-readable event signatures — single source of truth for §2.3.1 / §2.3.2. */
export const EVENT_SIGNATURES = {
  SalaryStreamCreated:
    "SalaryStreamCreated(uint256,address,address,uint256,uint256,uint256,uint256)",
  SalaryStreamWithdrawn: "SalaryStreamWithdrawn(uint256,address,uint256)",
  SalaryStreamCancelled: "SalaryStreamCancelled(uint256,uint256,uint256)",
} as const;

/** keccak256 topic0 hashes, computed from EVENT_SIGNATURES so ASC and worker never drift. */
export const EVENT_TOPICS = {
  SalaryStreamCreated: keccakId(EVENT_SIGNATURES.SalaryStreamCreated),
  SalaryStreamWithdrawn: keccakId(EVENT_SIGNATURES.SalaryStreamWithdrawn),
  SalaryStreamCancelled: keccakId(EVENT_SIGNATURES.SalaryStreamCancelled),
} as const;
