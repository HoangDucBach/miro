// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IStreamVerifier} from "./interfaces/IStreamVerifier.sol";

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @notice Holds LP liquidity, issues salary-stream-backed credit lines, and tracks
///         wage-garnishment obligations recorded by StreamVerifierASC on salary
///         withdrawal (§2.3.3). MVP: flat interest, no LP shares math, no liquidation
///         engine — enforcement gap is honestly bounded by the LTV buffer (§1.6).
contract CreditPool {
    uint256 public constant BASE_LTV_BPS = 5000; // 50%
    uint256 public constant LTV_STEP_BPS = 500; // +5% per fully-repaid loan
    uint256 public constant MAX_LTV_BPS = 7000; // 70% cap
    uint256 public constant GARNISH_BPS = 3000; // 30% of each salary withdrawal
    uint256 public constant INTEREST_BPS = 500; // flat 5% per loan (MVP; no time accrual)
    uint256 constant BPS_DENOM = 10_000;

    IERC20 public immutable usdc;
    IStreamVerifier public immutable verifier;
    address public owner;

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

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    modifier onlyVerifier() {
        require(msg.sender == address(verifier), "not verifier");
        _;
    }

    constructor(address usdc_, address verifier_) {
        owner = msg.sender;
        usdc = IERC20(usdc_);
        verifier = IStreamVerifier(verifier_);
    }

    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    function creditLimit(address user) public view returns (uint256) {
        uint256 ltv = min(BASE_LTV_BPS + repaidLoans[user] * LTV_STEP_BPS, MAX_LTV_BPS);
        return verifier.remainingLocked(user) * ltv / BPS_DENOM;
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

    /// @notice Called by StreamVerifierASC when a proven SalaryStreamWithdrawn event
    ///         is processed. Records the garnishment obligation; the actual tUSDC only
    ///         moves once the borrower calls settleGarnish (§1.6 cross-chain enforcement
    ///         gap: this contract cannot seize funds on Ethereum).
    function onSalaryWithdrawn(address b, uint256 salary) external onlyVerifier {
        if (debt[b] == 0) return;
        uint256 owed = min(salary * GARNISH_BPS / BPS_DENOM, debt[b]);
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
        // pendingGarnish is capped against `debt` independently on each onSalaryWithdrawn
        // call, so repeated withdrawals (or an intervening repay()) can leave
        // pendingGarnish > debt. Floor at debt so this never underflows-reverts and
        // permanently strands the borrower unable to clear their garnish obligation.
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
