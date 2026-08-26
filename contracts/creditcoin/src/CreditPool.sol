// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IStreamVerifier} from "./interfaces/IStreamVerifier.sol";
import {IPriceOracle} from "./interfaces/IPriceOracle.sol";

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
}

/// @notice Holds LP liquidity, issues salary-stream-backed credit lines, and tracks
///         wage-garnishment obligations recorded by StreamVerifierASC on salary withdrawal.
///         Flat interest, no LP shares math, no liquidation engine yet.
contract CreditPool {
    uint256 public constant BASE_LTV_BPS = 5000; // 50%
    uint256 public constant LTV_STEP_BPS = 500; // +5% per fully-repaid loan
    uint256 public constant MAX_LTV_BPS = 7000; // 70% cap
    uint256 public constant GARNISH_BPS = 3000; // 30% of each salary withdrawal
    uint256 public constant INTEREST_BPS = 500; // flat 5% per loan (MVP; no time accrual)
    uint256 constant BPS_DENOM = 10_000;

    IERC20 public immutable usdc;
    IStreamVerifier public immutable verifier;
    IPriceOracle public immutable priceOracle;
    uint8 public immutable debtDecimals;
    uint8 public constant COLLATERAL_DECIMALS = 18; // SalaryStream collateral is native ETH (wei)

    mapping(address => uint256) public debt; // principal + flat interest
    mapping(address => uint256) public pendingGarnish; // owed from salary withdrawals
    mapping(address => uint256) public repaidLoans; // drives LTV growth
    mapping(address => bool) public frozen; // stream cancelled

    uint256 public totalLPDeposits;
    mapping(address => uint256) public lpDeposits; // pro-rata, no shares math (MVP)

    event Deposited(address indexed lp, uint256 amount);
    event WithdrawnLP(address indexed lp, uint256 amount);
    event Borrowed(address indexed borrower, uint256 amount, uint256 newDebt);
    event Repaid(address indexed borrower, uint256 amount, uint256 remainingDebt);
    event GarnishRecorded(address indexed borrower, uint256 amount, uint256 pendingGarnish);
    event GarnishSettled(address indexed borrower, uint256 amount, uint256 remainingDebt);
    event StreamFrozen(address indexed borrower);
    event LoanFullyRepaid(address indexed borrower, uint256 newRepaidLoans);

    modifier onlyVerifier() {
        require(msg.sender == address(verifier), "not verifier");
        _;
    }

    constructor(address usdc_, address verifier_, address priceOracle_) {
        usdc = IERC20(usdc_);
        verifier = IStreamVerifier(verifier_);
        priceOracle = IPriceOracle(priceOracle_);
        debtDecimals = usdc.decimals();
    }

    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    /// @notice USD value of a wei (18-decimal ETH) amount, in the debt token's own
    ///         decimals. Used for both collateral valuation and salary-withdrawal
    ///         valuation, so the two can never drift onto different conversion logic.
    function _weiToDebtValue(uint256 weiAmount) internal view returns (uint256) {
        if (weiAmount == 0) return 0;

        uint256 oraclePrice = priceOracle.price();
        uint8 oracleDecimals = priceOracle.decimals();

        // weiAmount (18 decimals) * price (oracleDecimals) / 1e18 -> USD value, still
        // scaled by oracleDecimals. Multiply before dividing to keep full precision.
        uint256 usdValue = weiAmount * oraclePrice / (10 ** COLLATERAL_DECIMALS);
        return _rescale(usdValue, oracleDecimals, debtDecimals);
    }

    /// @notice USD value of the borrower's remaining locked collateral, in the debt
    ///         token's own decimals. remainingLocked() is wei (18-decimal ETH); without
    ///         this conversion a raw wei number would be spent directly as if it were
    ///         already a tUSDC amount, which is off by many orders of magnitude.
    function collateralValue(address user) public view returns (uint256) {
        return _weiToDebtValue(verifier.remainingLocked(user));
    }

    function creditLimit(address user) public view returns (uint256) {
        uint256 ltv = min(BASE_LTV_BPS + repaidLoans[user] * LTV_STEP_BPS, MAX_LTV_BPS);
        return collateralValue(user) * ltv / BPS_DENOM;
    }

    function _rescale(uint256 amount, uint8 fromDecimals, uint8 toDecimals) internal pure returns (uint256) {
        if (fromDecimals == toDecimals) return amount;
        if (fromDecimals > toDecimals) return amount / (10 ** (fromDecimals - toDecimals));
        return amount * (10 ** (toDecimals - fromDecimals));
    }

    function borrow(uint256 amount) external {
        require(!frozen[msg.sender], "stream cancelled");
        require(pendingGarnish[msg.sender] == 0, "settle garnish first");

        uint256 newDebt = debt[msg.sender] + amount + (amount * INTEREST_BPS / BPS_DENOM);
        require(newDebt <= creditLimit(msg.sender), "exceeds credit limit");

        debt[msg.sender] = newDebt;
        require(usdc.transfer(msg.sender, amount), "usdc transfer failed");

        emit Borrowed(msg.sender, amount, newDebt);
    }

    /// @notice Called by StreamVerifierASC when a proven SalaryStreamWithdrawn event is
    ///         processed. Only records the obligation, the tUSDC moves later when the
    ///         borrower calls settleGarnish. Can't seize funds on Ethereum directly.
    /// @param salaryWei the withdrawn amount, in wei (ETH) - same units as remainingLocked,
    ///        so it needs the same wei->debt-token conversion before GARNISH_BPS is applied.
    function onSalaryWithdrawn(address b, uint256 salaryWei) external onlyVerifier {
        if (debt[b] == 0) return;
        uint256 salaryValue = _weiToDebtValue(salaryWei);
        uint256 owed = min(salaryValue * GARNISH_BPS / BPS_DENOM, debt[b]);
        pendingGarnish[b] += owed;
        emit GarnishRecorded(b, owed, pendingGarnish[b]);
    }

    function onStreamCancelled(address b) external onlyVerifier {
        frozen[b] = true;
        emit StreamFrozen(b);
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
