import { id as keccakId } from "ethers";

/** Human-readable event signatures — single source of truth for §2.3.1 / §2.3.2.
 *  These are Sablier's real event signatures (SablierLockup v4.0), not ours -- verified
 *  2026-08-26 against sablier-labs/sdk/abi/lockup/v4.0/SablierLockup.json. */
export const EVENT_SIGNATURES = {
  CreateLockupLinearStream:
    "CreateLockupLinearStream(uint256,(address,address,address,uint128,address,bool,bool,(uint40,uint40),string),uint40,uint40,(uint128,uint128))",
  WithdrawFromLockupStream: "WithdrawFromLockupStream(uint256,address,address,uint128)",
} as const;

/** keccak256 topic0 hashes, computed from EVENT_SIGNATURES so ASC and worker never drift. */
export const EVENT_TOPICS = {
  CreateLockupLinearStream: keccakId(EVENT_SIGNATURES.CreateLockupLinearStream),
  WithdrawFromLockupStream: keccakId(EVENT_SIGNATURES.WithdrawFromLockupStream),
} as const;
