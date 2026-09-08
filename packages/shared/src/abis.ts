/**
 * Hand-written ABI fragments covering the external surface used by the worker and web app.
 * TODO: once `forge build` runs (contracts/source, contracts/creditcoin), replace these
 * with the generated artifacts from out/*.json so ABIs never drift from source (§2.7).
 */

export const CREDIT_PASSPORT_ABI = [
  "function processAttestation(uint64 chainKey, uint64 blockHeight, bytes encodedTransaction, bytes32 merkleRoot, tuple(bytes32 hash, bool isLeft)[] siblings, bytes32 lowerEndpointDigest, bytes32[] continuityRoots) external returns (bool)",
  "function setSource(tuple(uint64 chainKey, address emitter, bytes32 topic0, uint8 borrowerLoc, uint8 borrowerDataWord, uint8 amountDataWord, uint256 minAmount, bool negative, bool enabled) cfg) external",
  "function setLocalReporter(address reporter, bool enabled) external",
  "function localReporters(address) external view returns (bool)",
  "function sourceIdFor(uint64 chainKey, address emitter, bytes32 topic0) external pure returns (bytes32)",
  "function localSourceIdFor(address reporter) external pure returns (bytes32)",
  "function recordLocalRepay(address borrower, uint256 amount) external",
  "function scoreOf(address borrower) external view returns (uint256)",
  // Scoring parameters. Exposed so consumers can explain a score rather than restating
  // the formula's constants and drifting from the deployed contract.
  "function PER_SOURCE_CAP() external view returns (uint32)",
  "function REPAY_POINTS() external view returns (uint256)",
  "function DIVERSITY_POINTS() external view returns (uint256)",
  "function AGE_PERIOD() external view returns (uint256)",
  "function AGE_POINTS_PER_PERIOD() external view returns (uint256)",
  "function AGE_CAP_PERIODS() external view returns (uint256)",
  "function NEGATIVE_PENALTY() external view returns (uint256)",
  "function passports(address) external view returns (uint40 firstSeenAt, uint32 cappedRepays, uint32 negativeEvents, uint16 sourceCount)",
  "function sourceStats(address, bytes32) external view returns (uint32 count, uint40 lastAt)",
  "function sources(bytes32) external view returns (uint64 chainKey, address emitter, bytes32 topic0, uint8 borrowerLoc, uint8 borrowerDataWord, uint8 amountDataWord, uint256 minAmount, bool negative, bool enabled)",
  "event SourceSet(bytes32 indexed sourceId, uint64 chainKey, address emitter, bytes32 topic0, bool enabled)",
  "event LocalReporterSet(address indexed reporter, bool enabled)",
  "event RepayRecorded(address indexed borrower, bytes32 indexed sourceId, uint32 sourceCountForBorrower)",
  "event NegativeEventRecorded(address indexed borrower, bytes32 indexed sourceId)",
  "event AttestationProcessed(bytes32 indexed txKey, bytes32 indexed sourceId, address indexed borrower, uint256 amount)",
] as const;

export const PASSPORT_POOL_ABI = [
  "function depositCollateral() external payable",
  "function withdrawCollateral(uint256 amount) external",
  "function maxLtvBps(address borrower) public view returns (uint256)",
  "function collateralValue(address borrower) public view returns (uint256)",
  "function creditLimit(address borrower) public view returns (uint256)",
  "function borrow(uint256 amount) external",
  "function repay(uint256 amount) external",
  "function deposit(uint256 amount) external",
  "function withdrawLP(uint256 amount) external",
  "function collateralOf(address) public view returns (uint256)",
  "function debt(address) public view returns (uint256)",
  "function principalSinceLastReport(address) public view returns (uint256)",
  "function lpDeposits(address) public view returns (uint256)",
  "function totalLPDeposits() public view returns (uint256)",
  "event CollateralDeposited(address indexed borrower, uint256 amount)",
  "event CollateralWithdrawn(address indexed borrower, uint256 amount)",
  "event Borrowed(address indexed borrower, uint256 amount, uint256 newDebt)",
  "event Repaid(address indexed borrower, uint256 amount, uint256 remainingDebt)",
  "event FullRepayReported(address indexed borrower, uint256 principal)",
  "event Deposited(address indexed lp, uint256 amount)",
  "event WithdrawnLP(address indexed lp, uint256 amount)",
] as const;

export const PRICE_ORACLE_ABI = [
  "function price() external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function setPrice(uint256 newPrice) external",
  "event PriceUpdated(uint256 price)",
] as const;

export const TEST_USDC_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function faucet() external",
  // Faucet terms, so a UI can show the amount and the cooldown instead of letting the
  // claim revert with "faucet on cooldown" and leaving the user to guess why.
  "function FAUCET_AMOUNT() external view returns (uint256)",
  "function FAUCET_COOLDOWN() external view returns (uint256)",
  "function lastFaucetClaim(address) external view returns (uint256)",
  "function decimals() view returns (uint8)",
] as const;

/** Minimal surface of Aave V3's real, unmodified Pool contract on Sepolia -- not ours.
 *  Repay's indexed fields verified 2026-08-27 against aave-dao/aave-v3-origin's IPool.sol:
 *  reserve, user AND repayer are all indexed; only amount and useATokens are data. */
export const AAVE_POOL_ABI = [
  "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external",
  "function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf) external",
  "function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) external returns (uint256)",
  "event Repay(address indexed reserve, address indexed user, address indexed repayer, uint256 amount, bool useATokens)",
] as const;

/** Minimal surface of Morpho Blue's real, unmodified contract on Sepolia -- not ours.
 *  Repay's indexed fields verified 2026-08-27 against morpho-org/morpho-blue's
 *  EventsLib.sol: id, caller AND onBehalf are all indexed; only assets and shares are
 *  data. MarketParams/Id shapes verified against IMorpho.sol. */
export const MORPHO_ABI = [
  "function createMarket(tuple(address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams) external",
  "function supply(tuple(address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, bytes data) external returns (uint256, uint256)",
  "function supplyCollateral(tuple(address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, address onBehalf, bytes data) external",
  "function borrow(tuple(address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, address receiver) external returns (uint256, uint256)",
  "function repay(tuple(address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, bytes data) external returns (uint256, uint256)",
  "function isLltvEnabled(uint256 lltv) external view returns (bool)",
  "function isIrmEnabled(address irm) external view returns (bool)",
  "function position(bytes32 id, address user) external view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)",
  "event Repay(bytes32 indexed id, address indexed caller, address indexed onBehalf, uint256 assets, uint256 shares)",
] as const;

/** Demo tokens for the Morpho market on Sepolia (contracts/source/src/DemoToken.sol). */
export const DEMO_TOKEN_ABI = [
  "function mint(address to, uint256 amount) external",
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
] as const;
