// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IStreamVerifier} from "./interfaces/IStreamVerifier.sol";
import {IPriceOracle} from "./interfaces/IPriceOracle.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
}

/// @notice Holds LP liquidity, issues credit lines against whitelisted token-vesting
///         collateral, and tracks garnishment obligations recorded by the verifier on
///         withdrawal. Flat interest, no LP shares math, no liquidation engine yet.
contract CreditPool is Ownable {
    uint256 public constant LTV_STEP_BPS = 500; // +5% per fully-repaid loan
    uint256 public constant MAX_LTV_BPS = 7000; // 70% cap
    uint256 public constant GARNISH_BPS = 3000; // 30% of each withdrawal
    uint256 public constant INTEREST_BPS = 500; // flat 5% per loan (MVP; no time accrual)
    uint256 constant BPS_DENOM = 10_000;

    IERC20 public immutable usdc;
    IStreamVerifier public immutable verifier;
    uint8 public immutable debtDecimals;

    /// @notice Per-collateral-token config. A token not listed here is worth $0 as
    ///         collateral no matter what a stream proves about it -- whitelisting is what
    ///         replaces the old employer-staking sybil defense now that collateral can be
    ///         any ERC-20, not just ETH from a registered employer.
    struct CollateralConfig {
        address priceOracle;
        uint8 tokenDecimals;
        uint256 baseLtvBps; // starting LTV for this token; volatile tokens should be set lower
        bool enabled;
    }

    mapping(address => CollateralConfig) public collateralConfig;

    mapping(address => uint256) public debt; // principal + flat interest
    mapping(address => uint256) public pendingGarnish; // owed from stream withdrawals
    mapping(address => uint256) public repaidLoans; // drives LTV growth

    uint256 public totalLPDeposits;
    mapping(address => uint256) public lpDeposits; // pro-rata, no shares math (MVP)

    event CollateralTokenSet(address indexed token, address priceOracle, uint256 baseLtvBps, bool enabled);
    event Deposited(address indexed lp, uint256 amount);
    event WithdrawnLP(address indexed lp, uint256 amount);
    event Borrowed(address indexed borrower, uint256 amount, uint256 newDebt);
    event Repaid(address indexed borrower, uint256 amount, uint256 remainingDebt);
    event GarnishRecorded(address indexed borrower, uint256 amount, uint256 pendingGarnish);
    event GarnishSettled(address indexed borrower, uint256 amount, uint256 remainingDebt);
    event LoanFullyRepaid(address indexed borrower, uint256 newRepaidLoans);

    modifier onlyVerifier() {
        require(msg.sender == address(verifier), "not verifier");
        _;
    }

    constructor(address usdc_, address verifier_) Ownable(msg.sender) {
        usdc = IERC20(usdc_);
        verifier = IStreamVerifier(verifier_);
        debtDecimals = usdc.decimals();
    }

    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    /// @notice Admin-curated collateral whitelist. Must be called before any stream backed
    ///         by `token` can be borrowed against.
    function setCollateralToken(address token, address priceOracle, uint256 baseLtvBps, bool enabled)
        external
        onlyOwner
    {
        require(baseLtvBps <= MAX_LTV_BPS, "ltv above cap");
        collateralConfig[token] = CollateralConfig({
            priceOracle: priceOracle,
            tokenDecimals: IERC20(token).decimals(),
            baseLtvBps: baseLtvBps,
            enabled: enabled
        });
        emit CollateralTokenSet(token, priceOracle, baseLtvBps, enabled);
    }

    /// @notice USD value of a collateral-token amount, in the debt token's own decimals.
    ///         Used for both collateral valuation and withdrawal valuation, so the two can
    ///         never drift onto different conversion logic.
    function _tokenValueToDebtValue(uint256 amount, CollateralConfig memory cfg) internal view returns (uint256) {
        if (amount == 0) return 0;

        uint256 oraclePrice = IPriceOracle(cfg.priceOracle).price();
        uint8 oracleDecimals = IPriceOracle(cfg.priceOracle).decimals();

        uint256 usdValue = amount * oraclePrice / (10 ** cfg.tokenDecimals);
        return _rescale(usdValue, oracleDecimals, debtDecimals);
    }

    function _rescale(uint256 amount, uint8 fromDecimals, uint8 toDecimals) internal pure returns (uint256) {
        if (fromDecimals == toDecimals) return amount;
        if (fromDecimals > toDecimals) return amount / (10 ** (fromDecimals - toDecimals));
        return amount * (10 ** (toDecimals - fromDecimals));
    }

    function collateralValue(address user) public view returns (uint256) {
        CollateralConfig memory cfg = collateralConfig[verifier.collateralToken(user)];
        if (!cfg.enabled) return 0;
        return _tokenValueToDebtValue(verifier.remainingLocked(user), cfg);
    }

    function creditLimit(address user) public view returns (uint256) {
        CollateralConfig memory cfg = collateralConfig[verifier.collateralToken(user)];
        if (!cfg.enabled) return 0;
        uint256 ltv = min(cfg.baseLtvBps + repaidLoans[user] * LTV_STEP_BPS, MAX_LTV_BPS);
        return _tokenValueToDebtValue(verifier.remainingLocked(user), cfg) * ltv / BPS_DENOM;
    }

    function borrow(uint256 amount) external {
        require(pendingGarnish[msg.sender] == 0, "settle garnish first");

        uint256 newDebt = debt[msg.sender] + amount + (amount * INTEREST_BPS / BPS_DENOM);
        require(newDebt <= creditLimit(msg.sender), "exceeds credit limit");

        debt[msg.sender] = newDebt;
        require(usdc.transfer(msg.sender, amount), "usdc transfer failed");

        emit Borrowed(msg.sender, amount, newDebt);
    }

    /// @notice Called by the verifier when a proven withdrawal from the borrower's vesting
    ///         stream is processed. Only records the obligation, the tUSDC moves later
    ///         when the borrower calls settleGarnish. Can't seize funds on Ethereum directly.
    /// @param b the borrower whose stream was withdrawn from
    /// @param amount the withdrawn amount, in the collateral token's own decimals
    function onTokenWithdrawn(address b, uint256 amount) external onlyVerifier {
        if (debt[b] == 0) return;

        CollateralConfig memory cfg = collateralConfig[verifier.collateralToken(b)];
        uint256 value = _tokenValueToDebtValue(amount, cfg);
        uint256 owed = min(value * GARNISH_BPS / BPS_DENOM, debt[b]);
        pendingGarnish[b] += owed;
        emit GarnishRecorded(b, owed, pendingGarnish[b]);
    }

    function settleGarnish(uint256 amount) external {
        require(amount > 0 && amount <= pendingGarnish[msg.sender], "invalid amount");
        require(usdc.transferFrom(msg.sender, address(this), amount), "usdc transferFrom failed");

        pendingGarnish[msg.sender] -= amount;
        // pendingGarnish can end up bigger than debt (repeated withdrawals, or a repay()
        // in between), so floor at debt to avoid underflow here.
        debt[msg.sender] -= min(amount, debt[msg.sender]);

        emit GarnishSettled(msg.sender, amount, debt[msg.sender]);
        _checkFullRepay(msg.sender);
    }

    function repay(uint256 amount) external {
        require(amount > 0 && amount <= debt[msg.sender], "invalid amount");
        require(usdc.transferFrom(msg.sender, address(this), amount), "usdc transferFrom failed");

        debt[msg.sender] -= amount;
        emit Repaid(msg.sender, amount, debt[msg.sender]);
        _checkFullRepay(msg.sender);
    }

    function _checkFullRepay(address b) internal {
        if (debt[b] == 0 && pendingGarnish[b] == 0) {
            repaidLoans[b]++;
            emit LoanFullyRepaid(b, repaidLoans[b]);
        }
    }

    // --- LP side (MVP-simple, no shares math) ---

    function deposit(uint256 amount) external {
        require(amount > 0, "zero deposit");
        require(usdc.transferFrom(msg.sender, address(this), amount), "usdc transferFrom failed");
        lpDeposits[msg.sender] += amount;
        totalLPDeposits += amount;
        emit Deposited(msg.sender, amount);
    }

    function withdrawLP(uint256 amount) external {
        require(amount > 0 && amount <= lpDeposits[msg.sender], "invalid amount");
        // pro-rata against pool's current tUSDC balance (interest accrues to the pool)
        uint256 payout = amount * usdc.balanceOf(address(this)) / totalLPDeposits;
        lpDeposits[msg.sender] -= amount;
        totalLPDeposits -= amount;
        require(usdc.transfer(msg.sender, payout), "usdc transfer failed");
        emit WithdrawnLP(msg.sender, payout);
    }
}
