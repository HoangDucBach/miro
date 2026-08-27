# Miro — Product Spec

> **BUIDL CTC 2026 Fall — DeFi Track**
> A cross-chain credit passport, verified via the Attestcoin Protocol.

## 1.1 One-liner

Your repayment history is scattered across chains and protocols, invisible to any single lender. Miro attests real repayment events from real lending protocols on other chains into one portable, on-chain credit record — a passport that any lender can read to extend better terms, without ever seeing a bridge or an oracle operator.

## 1.2 Problem

A borrower who has faithfully repaid loans on Aave, on Morpho, or on some other chain entirely has *earned* trust — but that trust is stuck wherever it was earned. No lender on a different chain can see it without either trusting a bridge to move the data or a centralized oracle to report it. The result: every new lending relationship starts from zero, and DeFi falls back on the one thing it can verify locally — over-collateralization. This is the same problem Creditcoin has worked on for a decade in emerging-market microfinance (record real repayment behavior on-chain so it can unlock bigger capital elsewhere) — Miro is that idea generalized to any EVM chain, proven with today's Attestcoin Protocol instead of a bespoke integration.

## 1.3 Solution

1. **Real repayments already happen** on real lending protocols — Aave V3 and Morpho Blue on Sepolia in this build — entirely outside Miro. Miro never asks anyone to do anything differently.
2. Miro's worker watches for `Repay` events on each registered protocol and relays proofs of the ones that clear a protocol-specific anti-dust floor.
3. **Attestcoin Protocol** proves each repayment event on Creditcoin via Merkle + continuity proofs verified by the Block Prover Precompile — no trusted oracle operator, no bridge.
4. **CreditPassport** accumulates a deterministic, oracle-free score per borrower: repay count (capped per source so farming one protocol stops paying), source diversity (a bonus for having history on more than one protocol), and account age.
5. **PassportPool**, a reference lending pool built on Creditcoin, reads that score to grant a *higher* loan-to-value ratio — never above 75%, always over-collateralized — and reports its own full repayments back into the same passport it reads from. Credit built anywhere is usable here; credit built here is usable anywhere else that reads the passport.

## 1.4 Actors

| Actor | Chain(s) | Actions |
|---|---|---|
| Real lending protocols (Aave, Morpho) | Sepolia | Emit real `Repay` events in the ordinary course of their own business — never talk to Miro |
| Borrower | Sepolia + Creditcoin | Repays loans on any registered source (building score); deposits native tCTC collateral, borrows tUSDC, repays on PassportPool |
| Liquidity Provider | Creditcoin | Deposits tUSDC into PassportPool, earns interest |
| Off-chain Worker | both (read/write) | Watches registered source contracts for `Repay` events, waits for attestation, fetches proofs, submits to CreditPassport |

**No employer/vesting-specific actor exists in this design.** Sources are pure configuration (`CreditPassport.setSource`), not code — adding a new protocol or a new source chain later never touches a deployed contract's logic.

## 1.5 Core user journey

```
(already happened, outside Miro, on real protocols)
Borrower: repays a loan on Aave              ──► emits Repay(reserve, user, repayer, amount, useATokens)
Worker:   detect event ──► waitUntilHeightAttested ──► getProof ──► CreditPassport.processAttestation
Passport: verify proof (0x0FD2) ──► check receipt status == 1 ──► look up SourceConfig ──► record repay
Borrower: repays a loan on Morpho too         ──► another proven event, a second distinct source
Passport: scoreOf(borrower) = repayPoints + diversityBonus + agePoints

Borrower: PassportPool.depositCollateral() {value: tCTC}
Borrower: PassportPool.borrow(amount)         // limit = collateralValue × maxLtvBps(borrower), maxLtvBps ≤ 75%
Borrower: PassportPool.repay(amount) in full  ──► pool.recordLocalRepay(borrower, principal) on the passport
Passport: scoreOf(borrower) grows again — now three distinct sources, next loan qualifies for even more
```

## 1.6 Trust & risk model (state honestly in submission)

| Risk | Mitigation |
|---|---|
| Sybil / self-repay farming (borrow small, repay, repeat to inflate score cheaply) | Costs real gas + interest per cycle; `PER_SOURCE_CAP` (10) means one source stops paying after 10 counted repays; per-source `minAmount` filters dust; PassportPool only reports a **full** repayment above `MIN_CREDIT_LOAN`, not every partial repay. Not eliminated — stated honestly as the largest un-mitigated MVP risk |
| No KYC / wallet reset | A borrower can abandon a wallet and start a fresh one with zero history. This is self-limiting (fresh wallets get base terms, same as anyone), not a hard failure — the same way a real credit history doesn't transfer if someone opens a new identity |
| Malformed or unexpected event shapes from a registered source | `SourceConfig`-driven decoding skips (not reverts) any log whose topics/data don't match the configured shape — one malformed log can't halt an otherwise-valid proof submission |
| Liquidation-type events (e.g. Aave's `LiquidationCall`) | Sources can be registered `negative: true`, subtracting from score instead of adding — a defaulted or liquidated position costs reputation, not just fails to build it |
| PassportPool over-extending credit | `maxLtvBps` is capped at 75% regardless of score — the passport only ever narrows the collateral gap, never removes the over-collateralization requirement. No liquidation engine exists yet (see §1.7) |
| Prover API downtime | Liveness-only risk. Proofs are verified on-chain by the precompile; a lying/failing Prover API can delay but never forge. `RawProofBuilder` is a drop-in fallback (same `ProofProvider` interface) |
| Replay of proofs | CreditPassport replay protection: `processedQueries[txKey]` keyed on (chainKey, blockHeight, txIndex) |
| Failed source tx passed off as success | **Mandatory** receipt-status check (`receiptStatus == 1`) — the precompile proves inclusion, NOT success |
| Only one testnet source chain exists today | CC3 Testnet currently supports only Sepolia as a source (verified against Creditcoin's own network config). `SourceConfig.chainKey` is never hardcoded, so supporting a second chain the moment Creditcoin adds one is a config change, not a redeploy — stated as a real, current limitation, not solved |

## 1.7 Out of scope (MVP)

Full liquidation engine · interest-rate curves · governance · KYC/identity binding · a live second source chain (blocked on Creditcoin's own testnet support, see §1.6) · mainnet deployment.

## 1.8 Hackathon submission mapping

| Requirement | Deliverable |
|---|---|
| Working Attestcoin integration | `CreditPassport.sol` + worker, live on CC3 Testnet, reading real Aave V3 and Morpho Blue `Repay` events on Sepolia |
| Technical documentation | [technical-spec.md](./technical-spec.md) + README |
| Deployed on testnet | Sepolia (reads Aave's and Morpho's real deployments) + CC3 Testnet (passport, pool) |
| Original work | `CreditPassport.sol` and `PassportPool.sol` are original; Aave and Morpho are intentionally unmodified, real, already-deployed protocols — proving external repayment behavior is the point, not reimplementing lending |
| Demo video | Scripted E2E flow ([demo-script.md](./demo-script.md)) |
| Depth of utilization | Cross-chain proof verification against **two** independent real protocols with different event shapes, decoded through one config-driven mechanism; local same-chain feedback loop; trust-model writeup covering sybil risk honestly |
