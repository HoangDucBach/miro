/**
 * Hand-written ABI fragments covering the external surface used by the worker and web app.
 * TODO: once `forge build` runs (contracts/source, contracts/creditcoin), replace these
 * with the generated artifacts from out/*.json so ABIs never drift from source (§2.7).
 */

/**
 * Sablier's real, unmodified SablierLockup contract (v4.0), deployed on Sepolia by
 * Sablier Labs -- not something Miro deploys or controls. Only the Lockup Linear surface
 * Miro actually reads/calls is included here; field names verified 2026-08-26 against
 * sablier-labs/sdk/abi/lockup/v4.0/SablierLockup.json (see docs/attestcoin-integration.md
 * for the deployed address).
 */
export const SABLIER_LOCKUP_ABI = [
  "function createWithDurationsLL(tuple(address sender, address recipient, uint128 depositAmount, address token, bool cancelable, bool transferable, string shape) params, tuple(uint128 start, uint128 cliff) unlockAmounts, uint40 granularity, tuple(uint40 cliff, uint40 total) durations) payable returns (uint256 streamId)",
  "function withdraw(uint256 streamId, address to, uint128 amount) external",
  "function withdrawMax(uint256 streamId, address to) external returns (uint128 withdrawnAmount)",
  "function isCancelable(uint256 streamId) external view returns (bool)",
  "function isTransferable(uint256 streamId) external view returns (bool)",
  "function ownerOf(uint256 streamId) external view returns (address)",
  "function withdrawableAmountOf(uint256 streamId) external view returns (uint128)",
  "function streamedAmountOf(uint256 streamId) external view returns (uint128)",
  "event CreateLockupLinearStream(uint256 indexed streamId, tuple(address funder, address sender, address recipient, uint128 depositAmount, address token, bool cancelable, bool transferable, tuple(uint40 start, uint40 end) timestamps, string shape) commonParams, uint40 cliffTime, uint40 granularity, tuple(uint128 start, uint128 cliff) unlockAmounts)",
  "event WithdrawFromLockupStream(uint256 indexed streamId, address indexed to, address indexed token, uint128 amount)",
] as const;

export const STREAM_VERIFIER_ASC_ABI = [
  "function processStreamEvent(uint64 chainKey, uint64 blockHeight, bytes encodedTransaction, bytes32 merkleRoot, tuple(bytes32 hash, bool isLeft)[] siblings, bytes32 lowerEndpointDigest, bytes32[] continuityRoots) external returns (bool)",
  "function remainingLocked(address user) external view returns (uint256)",
  "function collateralToken(address user) external view returns (address)",
  "function streamIdOf(address) external view returns (uint256)",
  "function streamById(uint256) external view returns (address borrower, address token, uint128 depositAmount, uint40 startTime, uint40 endTime, bool exists)",
  "event StreamRegistered(address indexed borrower, address indexed token, uint256 depositAmount)",
  "event StreamEventProcessed(bytes32 indexed txKey, bytes32 indexed sig, address indexed borrower)",
] as const;

export const CREDIT_POOL_ABI = [
  "function creditLimit(address user) public view returns (uint256)",
  "function collateralValue(address user) public view returns (uint256)",
  "function collateralConfig(address token) external view returns (address priceOracle, uint8 tokenDecimals, uint256 baseLtvBps, bool enabled)",
  "function setCollateralToken(address token, address priceOracle, uint256 baseLtvBps, bool enabled) external",
  "function borrow(uint256 amount) external",
  "function repay(uint256 amount) external",
  "function settleGarnish(uint256 amount) external",
  "function deposit(uint256 amount) external",
  "function withdrawLP(uint256 amount) external",
  "function debt(address) public view returns (uint256)",
  "function pendingGarnish(address) public view returns (uint256)",
  "function repaidLoans(address) public view returns (uint256)",
  "event Borrowed(address indexed borrower, uint256 amount, uint256 newDebt)",
  "event GarnishRecorded(address indexed borrower, uint256 amount, uint256 pendingGarnish)",
  "event GarnishSettled(address indexed borrower, uint256 amount, uint256 remainingDebt)",
  "event CollateralTokenSet(address indexed token, address priceOracle, uint256 baseLtvBps, bool enabled)",
] as const;

export const PRICE_ORACLE_ABI = [
  "function price() external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function setPrice(uint256 newPrice) external",
  "event PriceUpdated(uint256 price)",
] as const;

export const TEST_USDC_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function faucet() external",
  "function decimals() view returns (uint8)",
] as const;

/** Demo collateral token on Sepolia (contracts/source/src/NebulaToken.sol). Not a real
 * third-party asset -- exists so the demo has a controllable price and supply. */
export const NEBULA_TOKEN_ABI = [
  "function mint(address to, uint256 amount) external",
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
] as const;
