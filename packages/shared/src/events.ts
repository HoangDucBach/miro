import { id as keccakId } from "ethers";

/** Human-readable event signatures for the two Sepolia lending protocols the passport
 *  proves repayments from. Neither is ours -- both are real, unmodified protocols.
 *  Verified 2026-08-27: Aave against aave-dao/aave-v3-origin's IPool.sol, Morpho against
 *  morpho-org/morpho-blue's EventsLib.sol. Indexed-ness doesn't change the canonical
 *  signature string (only types matter for the topic0 hash), but it does change where
 *  each field lives in topics vs. data -- see abis.ts's doc comments for that. */
export const EVENT_SIGNATURES = {
  AaveRepay: "Repay(address,address,address,uint256,bool)",
  MorphoRepay: "Repay(bytes32,address,address,uint256,uint256)",
  AaveLiquidationCall: "LiquidationCall(address,address,address,uint256,uint256,address,bool)",
} as const;

/** keccak256 topic0 hashes, computed from EVENT_SIGNATURES so CreditPassport source
 *  registration and the worker's listener filters never drift apart. */
export const EVENT_TOPICS = {
  AaveRepay: keccakId(EVENT_SIGNATURES.AaveRepay),
  MorphoRepay: keccakId(EVENT_SIGNATURES.MorphoRepay),
  AaveLiquidationCall: keccakId(EVENT_SIGNATURES.AaveLiquidationCall),
} as const;
