# StreamCredit — Product Spec

> **BUIDL CTC 2026 Fall — DeFi Track**
> Salary-stream-backed on-chain credit, verified cross-chain via the Attestcoin Protocol.

## 1.1 One-liner

Borrow against your on-chain salary stream. Employers pay via locked payment streams on Ethereum; the Attestcoin Protocol cryptographically proves those streams on Creditcoin; borrowers receive a bank-style credit line — no crypto over-collateralization.

## 1.2 Problem

DeFi lending requires over-collateralization (deposit $150 to borrow $100), excluding everyone whose primary asset is **future income** rather than existing capital. Traditional banks solve this by underwriting salary records — DeFi cannot, because there is no trustless way to prove income across chains. Centralized oracles reintroduce a single point of failure.

## 1.3 Solution

1. **Employer** locks salary funds in a stream contract on Ethereum (funds vest per-second to the employee).
2. **Attestcoin Protocol** proves stream lifecycle events (`Created` / `Withdrawn` / `Cancelled`) on Creditcoin via Merkle + continuity proofs verified by the Block Prover Precompile — no trusted oracle operator.
3. **CreditPool** on Creditcoin grants a credit line capped at a fraction of the *remaining locked* stream value.
4. On every salary withdrawal, a **garnishment obligation** is recorded — a fixed % of the withdrawal is owed to the pool before further borrowing is allowed (wage-garnishment model).

## 1.4 Actors

| Actor | Chain(s) | Actions |
|---|---|---|
| Employer | Creditcoin + Ethereum | Registers in `EmployerRegistry` (stakes CTC) → creates salary streams on Sepolia |
| Borrower (employee) | Ethereum + Creditcoin | Receives stream; borrows tUSDC from `CreditPool`; withdraws salary; settles garnishment; repays |
| Liquidity Provider | Creditcoin | Deposits tUSDC into `CreditPool`, earns interest |
| Off-chain Worker | both (read/write) | Watches stream events, waits for attestation, fetches proofs from Proof Builder service, submits to ASC |

## 1.5 Core user journey

```
Employer: register(stake CTC)  ──►  createStream(employee, 6 months, 6000 USDC)
                                              │ emits StreamCreated
Worker:   detect event ──► waitUntilHeightAttested ──► getProof ──► ASC.processStreamEvent
ASC:      verify proof (0x0FD2) ──► check receipt status == 1 ──► record StreamRecord
Borrower: borrow(1500)   // limit = remainingLocked × 50% LTV
Borrower: withdraw(1000 salary on Ethereum)
Worker:   proves StreamWithdrawn ──► ASC ──► CreditPool.onSalaryWithdrawn
Pool:     garnish = min(1000 × 30%, debt) recorded as pendingGarnish; borrowing frozen until settled
Borrower: settleGarnish(300) ──► debt reduced ──► credit line reopens
Repaid in full ──► creditScore++ ──► next-loan LTV 50% → 55% (cap 70%)
```

## 1.6 Trust & risk model (state honestly in submission)

| Risk | Mitigation |
|---|---|
| Fake self-streams (sybil salary) | Only streams whose `sender` is a staked, registered employer count. MVP proxy for KYC; roadmap: attestation-based employer identity, slashing |
| Stream cancelled mid-loan | Credit limit ≤ 50% of *remaining locked* value at all times → lender buffer always exists. Cancel event freezes borrowing immediately |
| Cross-chain enforcement gap (loan on CC, salary on ETH) | MVP cannot seize ETH funds. Garnishment = recorded obligation + borrow/withdraw freeze until settled. Buffer (50% cap) protects LPs. Roadmap: Attestcoin Writability to enforce splits on the source chain |
| Prover API downtime | Liveness-only risk. Proofs are verified on-chain by the precompile; a lying/failing Prover API can delay but never forge. `RawProofBuilder` is a drop-in fallback (same `ProofProvider` interface) |
| Replay of proofs | ASC replay protection: `processedQueries[txKey]` keyed on (chainKey, blockHeight, txIndex) |
| Failed source tx passed off as success | **Mandatory** receipt-status check (`receiptStatus == 1`) — the precompile proves inclusion, NOT success |

## 1.7 Out of scope (MVP)

Multi-chain sources · reputation NFTs · full liquidation engine · interest-rate curves · governance · Attestcoin Writability · mainnet deployment.

## 1.8 Hackathon submission mapping

| Requirement | Deliverable |
|---|---|
| Working Attestcoin integration | `StreamVerifierASC.sol` + worker, live on CC3 Testnet |
| Technical documentation | [technical-spec.md](./technical-spec.md) + README |
| Deployed on testnet | Sepolia (stream) + CC3 Testnet (ASC, pool, registry) |
| Original work | All contracts written from scratch during hackathon; no Sablier fork |
| Demo video | Scripted E2E flow ([demo-script.md](./demo-script.md)) |
| Depth of utilization | 3 distinct event types proven; receipt-status validation; batch proofs (stretch); trust-model writeup |
