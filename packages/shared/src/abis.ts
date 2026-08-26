/**
 * Hand-written ABI fragments covering the external surface used by the worker and web app.
 * TODO: once `forge build` runs (contracts/source, contracts/creditcoin), replace these
 * with the generated artifacts from out/*.json so ABIs never drift from source (§2.7).
 */

export const SALARY_STREAM_ABI = [
  "event SalaryStreamCreated(uint256 indexed streamId, address indexed sender, address indexed recipient, uint256 deposit, uint256 ratePerSecond, uint256 startTime, uint256 stopTime)",
  "event SalaryStreamWithdrawn(uint256 indexed streamId, address indexed recipient, uint256 amount)",
  "event SalaryStreamCancelled(uint256 indexed streamId, uint256 senderRefund, uint256 recipientPayout)",
  "function createStream(address recipient, uint256 stopTime) external payable returns (uint256 streamId)",
  "function balanceOf(uint256 streamId) public view returns (uint256 withdrawable)",
  "function withdraw(uint256 streamId, uint256 amount) external",
  "function cancel(uint256 streamId) external",
  "function streams(uint256) public view returns (address sender, address recipient, uint256 deposit, uint256 ratePerSecond, uint256 startTime, uint256 stopTime, uint256 withdrawn, bool cancelled)",
] as const;

export const STREAM_VERIFIER_ASC_ABI = [
  "function processStreamEvent(uint64 chainKey, uint64 blockHeight, bytes encodedTransaction, bytes32 merkleRoot, tuple(bytes32 hash, bool isLeft)[] siblings, bytes32 lowerEndpointDigest, bytes32[] continuityRoots) external returns (bool)",
  "function remainingLocked(address user) external view returns (uint256)",
  "function streamOf(address) public view returns (address employer, uint256 deposit, uint256 ratePerSecond, uint256 startTime, uint256 stopTime, uint256 withdrawn, bool cancelled, bool exists)",
  "event StreamRegistered(address indexed borrower, address indexed employer, uint256 deposit)",
  "event StreamEventProcessed(bytes32 indexed txKey, bytes32 indexed sig, address indexed borrower)",
] as const;

export const CREDIT_POOL_ABI = [
  "function creditLimit(address user) public view returns (uint256)",
  "function collateralValue(address user) public view returns (uint256)",
  "function priceOracle() external view returns (address)",
  "function borrow(uint256 amount) external",
  "function repay(uint256 amount) external",
  "function settleGarnish(uint256 amount) external",
  "function deposit(uint256 amount) external",
  "function withdrawLP(uint256 amount) external",
  "function debt(address) public view returns (uint256)",
  "function pendingGarnish(address) public view returns (uint256)",
  "function repaidLoans(address) public view returns (uint256)",
  "function frozen(address) public view returns (bool)",
  "event Borrowed(address indexed borrower, uint256 amount, uint256 newDebt)",
  "event GarnishRecorded(address indexed borrower, uint256 amount, uint256 pendingGarnish)",
  "event GarnishSettled(address indexed borrower, uint256 amount, uint256 remainingDebt)",
] as const;

export const PRICE_ORACLE_ABI = [
  "function price() external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function setPrice(uint256 newPrice) external",
  "event PriceUpdated(uint256 price)",
] as const;

export const EMPLOYER_REGISTRY_ABI = [
  "function register() external payable",
  "function isVerified(address employer) external view returns (bool)",
  "function deregister() external",
  "function MIN_STAKE() external view returns (uint256)",
  "function stakeOf(address) external view returns (uint256)",
  "event Registered(address indexed employer, uint256 stake)",
] as const;

export const TEST_USDC_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function faucet() external",
  "function decimals() view returns (uint8)",
] as const;
