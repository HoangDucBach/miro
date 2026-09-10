import { encodeAbiParameters, keccak256, parseAbi, type Address, type Hex } from "viem";

/**
 * Morpho Blue addresses a market by a struct, not an id, on every write -- so a UI that
 * repays needs the five parameters, and the id is derived from them rather than
 * configured separately.
 */
export interface MorphoMarketParams {
  loanToken: Address;
  collateralToken: Address;
  oracle: Address;
  irm: Address;
  lltv: bigint;
}

/**
 * Declared here rather than in @miro/shared because the two consumers need different
 * dialects: shared's ABI strings are parsed by ethers in the worker, and ethers' parser
 * rejects the named-struct syntax below, while viem's rejects the inline `tuple(...)` form
 * shared uses. The read side (`position`, `market`) takes plain bytes32 and goes through
 * the generated hooks as usual -- only the struct-taking writes need this.
 */
export const morphoMarketAbi = parseAbi([
  "struct MarketParams { address loanToken; address collateralToken; address oracle; address irm; uint256 lltv; }",
  "function repay(MarketParams marketParams, uint256 assets, uint256 shares, address onBehalf, bytes data) returns (uint256, uint256)",
]);

/**
 * Mirrors Morpho's MarketParamsLib.id(): keccak256 over the five parameters as 32-byte
 * words. The worker derives the same id when it creates the market.
 */
export function morphoMarketId(p: MorphoMarketParams): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "address" }, { type: "address" }, { type: "address" }, { type: "uint256" }],
      [p.loanToken, p.collateralToken, p.oracle, p.irm, p.lltv],
    ),
  );
}
