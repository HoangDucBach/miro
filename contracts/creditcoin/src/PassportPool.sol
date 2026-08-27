// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {ICreditPassport} from "./interfaces/ICreditPassport.sol";
import {IPriceOracle} from "./interfaces/IPriceOracle.sol";

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
}

/// @notice Reference lending pool: proof-of-concept for what a CreditPassport score is
///         for. Collateralized in native tCTC, always over-collateralized (LTV capped
///         below 100% even at max score) -- the passport only ever narrows the gap
///         between collateral and debt, never removes it. Every full repayment also
///         feeds the same passport it reads from, so credit built anywhere is usable
///         here and credit built here is usable anywhere else that reads the passport.
contract PassportPool {
    uint256 public constant BASE_LTV_BPS = 5000; // 50%, available with zero passport history
    uint256 public constant MAX_LTV_BPS = 7500; // 75% cap -- always over-collateralized
    uint256 public constant SCORE_LTV_CAP = 250; // passport score points that saturate the bonus
    uint256 public constant SCORE_BPS_PER_POINT = 10; // +0.1% LTV per point, up to +25%
    uint256 public constant INTEREST_BPS = 500; // flat 5% per loan (MVP; no time accrual)
    uint256 public constant MIN_CREDIT_LOAN = 10e6; // min cumulative principal before a full repay is reported
    uint256 constant BPS_DENOM = 10_000;
    uint8 public constant COLLATERAL_DECIMALS = 18; // native tCTC, same scale as ETH

    IERC20 public immutable usdc;
    ICreditPassport public immutable passport;
    IPriceOracle public immutable ctcOracle;
    uint8 public immutable debtDecimals;

    mapping(address => uint256) public collateralOf; // native tCTC wei
    mapping(address => uint256) public debt; // principal + flat interest
    mapping(address => uint256) public principalSinceLastReport; // accumulates across cycles until reported

    uint256 public totalLPDeposits;
    mapping(address => uint256) public lpDeposits; // pro-rata, no shares math (MVP)

    event CollateralDeposited(address indexed borrower, uint256 amount);
    event CollateralWithdrawn(address indexed borrower, uint256 amount);
    event Borrowed(address indexed borrower, uint256 amount, uint256 newDebt);
    event Repaid(address indexed borrower, uint256 amount, uint256 remainingDebt);
    event FullRepayReported(address indexed borrower, uint256 principal);
    event Deposited(address indexed lp, uint256 amount);
    event WithdrawnLP(address indexed lp, uint256 amount);

    constructor(address usdc_, address passport_, address ctcOracle_) {
        usdc = IERC20(usdc_);
        passport = ICreditPassport(passport_);
        ctcOracle = IPriceOracle(ctcOracle_);
        debtDecimals = usdc.decimals();
    }

    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    // ---------------------------------------------------------------
    // Collateral
    // ---------------------------------------------------------------

    function depositCollateral() external payable {
        require(msg.value > 0, "zero deposit");
        collateralOf[msg.sender] += msg.value;
        emit CollateralDeposited(msg.sender, msg.value);
    }

    /// @notice Withdraws collateral as long as what remains still covers current debt at
    ///         this borrower's current LTV cap.
    function withdrawCollateral(uint256 amount) external {
        require(amount > 0 && amount <= collateralOf[msg.sender], "invalid amount");
        uint256 remaining = collateralOf[msg.sender] - amount;
        require(debt[msg.sender] <= _creditLimitFor(msg.sender, remaining), "would breach LTV");

        collateralOf[msg.sender] = remaining;
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "transfer failed");
        emit CollateralWithdrawn(msg.sender, amount);
    }

    // ---------------------------------------------------------------
    // Passport-adjusted credit terms
    // ---------------------------------------------------------------

    /// @notice LTV this borrower currently qualifies for: 50% base, +0.1% per passport
    ///         score point up to 250 points, capped at 75% regardless of score.
    function maxLtvBps(address borrower) public view returns (uint256) {
        uint256 cappedScore = min(passport.scoreOf(borrower), SCORE_LTV_CAP);
        return min(BASE_LTV_BPS + cappedScore * SCORE_BPS_PER_POINT, MAX_LTV_BPS);
    }

    function collateralValue(address borrower) public view returns (uint256) {
        return _collateralValueUsd(collateralOf[borrower]);
    }

    function creditLimit(address borrower) public view returns (uint256) {
        return _creditLimitFor(borrower, collateralOf[borrower]);
    }

    function _creditLimitFor(address borrower, uint256 collateralWei) internal view returns (uint256) {
        return _collateralValueUsd(collateralWei) * maxLtvBps(borrower) / BPS_DENOM;
    }

    function _collateralValueUsd(uint256 collateralWei) internal view returns (uint256) {
        if (collateralWei == 0) return 0;
        uint256 oraclePrice = ctcOracle.price();
        uint8 oracleDecimals = ctcOracle.decimals();
        uint256 usdValue = collateralWei * oraclePrice / (10 ** COLLATERAL_DECIMALS);
        return _rescale(usdValue, oracleDecimals, debtDecimals);
    }

    function _rescale(uint256 amount, uint8 fromDecimals, uint8 toDecimals) internal pure returns (uint256) {
        if (fromDecimals == toDecimals) return amount;
        if (fromDecimals > toDecimals) return amount / (10 ** (fromDecimals - toDecimals));
        return amount * (10 ** (toDecimals - fromDecimals));
    }

    // ---------------------------------------------------------------
    // Borrow / repay
    // ---------------------------------------------------------------

    function borrow(uint256 amount) external {
        uint256 newDebt = debt[msg.sender] + amount + (amount * INTEREST_BPS / BPS_DENOM);
        require(newDebt <= creditLimit(msg.sender), "exceeds credit limit");

        debt[msg.sender] = newDebt;
        principalSinceLastReport[msg.sender] += amount;
        require(usdc.transfer(msg.sender, amount), "usdc transfer failed");

        emit Borrowed(msg.sender, amount, newDebt);
    }

    /// @notice Repays debt; once it reaches zero and enough principal has accumulated
    ///         since the last report, feeds that repayment history back into the
    ///         passport this same pool reads its LTV bonus from.
    function repay(uint256 amount) external {
        require(amount > 0 && amount <= debt[msg.sender], "invalid amount");
        require(usdc.transferFrom(msg.sender, address(this), amount), "usdc transferFrom failed");

        debt[msg.sender] -= amount;
        emit Repaid(msg.sender, amount, debt[msg.sender]);

        if (debt[msg.sender] == 0 && principalSinceLastReport[msg.sender] >= MIN_CREDIT_LOAN) {
            uint256 principal = principalSinceLastReport[msg.sender];
            principalSinceLastReport[msg.sender] = 0;
            passport.recordLocalRepay(msg.sender, principal);
            emit FullRepayReported(msg.sender, principal);
        }
    }

    // ---------------------------------------------------------------
    // LP side (MVP-simple, no shares math)
    // ---------------------------------------------------------------

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
