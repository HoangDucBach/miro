# Miro — Product Spec

> **BUIDL CTC 2026 Fall — DeFi Track**
> Token-vesting-backed on-chain credit, verified cross-chain via the Attestcoin Protocol.

## 1.1 One-liner

Borrow against your unvested token grant. Vesting positions already exist on Sablier (real, deployed, in production); the Attestcoin Protocol cryptographically proves the remaining locked value of that position on Creditcoin; the holder receives a credit line — no need to sell tokens early to get cash.

## 1.2 Problem

DeFi lending requires over-collateralization (deposit $150 to borrow $100), excluding everyone whose primary asset is **future, already-committed value** rather than liquid capital. Team members, advisors, and investors holding an unvested token grant are in exactly this position: the value is real and contractually locked, but illiquid until it vests — so today the only way to get cash against it is to sell vested tokens on the open market, forcing an early sale, a taxable event, and visible sell pressure. There is no trustless way to prove *how much value remains locked* in a vesting position on one chain to a lender on another chain without a centralized oracle.

## 1.3 Solution

1. A **vesting stream already exists** on [Sablier](https://sablier.com) — the holder did not create it for Miro; it was granted earlier by a project/DAO/employer, independent of Miro entirely.
2. Miro's worker detects the stream, but only accepts it as collateral if `SablierLockup.isCancelable(streamId) == false` — a stream that can still be revoked by its sender is rejected outright (see §1.6).
3. **Attestcoin Protocol** proves the stream's state (`CreateLockupLinearStream` / `WithdrawFromLockupStream` / `CancelLockupStream`) on Creditcoin via Merkle + continuity proofs verified by the Block Prover Precompile — no trusted oracle operator.
4. **CreditPool** on Creditcoin grants a credit line capped at a fraction of the *remaining locked* value of the stream, priced through a per-token price feed (not a single fixed ETH price — the vested asset can be any whitelisted ERC-20).
5. On every withdrawal from the stream, a **garnishment obligation** is recorded — a fixed % of the withdrawal is owed to the pool before further borrowing is allowed.

## 1.4 Actors

| Actor | Chain(s) | Actions |
|---|---|---|
| Grantor (project/DAO) | Ethereum (Sepolia) | Already created the vesting stream on Sablier, entirely outside Miro — Miro never talks to this actor |
| Borrower (stream NFT holder) | Ethereum + Creditcoin | Holds the Sablier Lockup NFT; borrows tUSDC from `CreditPool`; withdraws vested tokens; settles garnishment; repays |
| Liquidity Provider | Creditcoin | Deposits tUSDC into `CreditPool`, earns interest |
| Off-chain Worker | both (read/write) | Watches Sablier stream events, waits for attestation, fetches proofs, submits to ASC |

**Important shift from the original design**: there is no `EmployerRegistry`-style actor to register or stake. Sybil defense moves from "the sender must be a staked, registered employer" to "the collateral token itself must be on an admin-curated whitelist with a real price feed" — see §1.6.

## 1.5 Core user journey

```
(already happened, outside Miro)
Grantor:  SablierLockup.createWithDurationsLL(borrower, 730 days, asset=PROJ, amount)
                                              │ emits CreateLockupLinearStream
Worker:   detect event ──► check isCancelable == false ──► reject if true
          ──► waitUntilHeightAttested ──► getProof ──► ASC.processStreamEvent
ASC:      verify proof (0x0FD2) ──► check receipt status == 1 ──► record StreamRecord
Borrower: borrow(1500)   // limit = remainingLocked(priced via PROJ/USD feed) × LTV
Borrower: SablierLockup.withdraw(streamId, to, amount)   // vested PROJ, on Ethereum
Worker:   proves WithdrawFromLockupStream ──► ASC ──► CreditPool.onTokenWithdrawn
Pool:     garnish = min(withdrawn value × 30%, debt) recorded as pendingGarnish; borrowing frozen until settled
Borrower: settleGarnish(300) ──► debt reduced ──► credit line reopens
Repaid in full ──► creditScore++ ──► next-loan LTV grows (cap unchanged at 70%)
```

## 1.6 Trust & risk model (state honestly in submission)

| Risk | Mitigation |
|---|---|
| Grantor revokes unvested tokens mid-loan | Only streams where `isCancelable() == false` are accepted as collateral. `renounce()` is one-directional (cancelable → non-cancelable, never the reverse), so this check made once at borrow time holds permanently — not just a point-in-time snapshot |
| Collateral token price manipulation (thin-liquidity token) | Only whitelisted tokens with a real price feed are accepted; LTV is set lower for higher-volatility assets than it would be for a blue-chip asset. No liquidation engine exists yet (see §1.7), so this remains the largest un-mitigated economic risk in the MVP |
| Stream NFT sold/transferred mid-loan | **Unsolved in the MVP.** Sablier's Lockup position is an ERC-721; `ownerOf(streamId)` can change without CreditPool's knowledge, since CreditPool does not custody the NFT. Roadmap: require the NFT be transferred into a Miro-controlled escrow on Ethereum as a precondition of borrowing, which would also let garnishment be enforced locally on Ethereum instead of waiting on a cross-chain relay — blocked until Attestcoin Writability exists (see below) |
| Cross-chain enforcement gap (loan on CC, tokens on ETH) | MVP cannot seize Ethereum-side funds. Garnishment = recorded obligation + borrow freeze until settled. LTV cap protects LPs against *unvested* value shrinking, not against default. Roadmap: Attestcoin Writability to enforce splits (or NFT release) on the source chain directly |
| Prover API downtime | Liveness-only risk. Proofs are verified on-chain by the precompile; a lying/failing Prover API can delay but never forge. `RawProofBuilder` is a drop-in fallback (same `ProofProvider` interface) |
| Replay of proofs | ASC replay protection: `processedQueries[txKey]` keyed on (chainKey, blockHeight, txIndex) |
| Failed source tx passed off as success | **Mandatory** receipt-status check (`receiptStatus == 1`) — the precompile proves inclusion, NOT success |
| Borrower never withdraws, debt sits forever | **Unsolved**, same as the original salary-stream design — no liquidation engine, no forced repayment. Stated honestly as an MVP gap, not hidden |

## 1.7 Out of scope (MVP)

Multi-chain collateral sources · NFT escrow / custody (see §1.6 roadmap) · full liquidation engine · interest-rate curves · governance · Attestcoin Writability · mainnet deployment.

## 1.8 Hackathon submission mapping

| Requirement | Deliverable |
|---|---|
| Working Attestcoin integration | ASC-equivalent verifier + worker, live on CC3 Testnet, reading real Sablier Lockup state on Sepolia |
| Technical documentation | [technical-spec.md](./technical-spec.md) + README |
| Deployed on testnet | Sepolia (reads Sablier's real `SablierLockup` deployment) + CC3 Testnet (verifier, pool) |
| Original work | CreditPool, the ASC-equivalent verifier, and the worker are all original; the collateral source (`SablierLockup`) is intentionally an unmodified, real, already-deployed protocol — proving external state is the point, not reimplementing it |
| Demo video | Scripted E2E flow ([demo-script.md](./demo-script.md)) |
| Depth of utilization | Cross-chain event verification against a real third-party protocol's live state; receipt-status validation; per-token price-feed collateral; trust-model writeup covering the new risks this introduces |
