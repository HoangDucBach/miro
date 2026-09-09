# DoraHacks BUIDL — submission copy

> Paste-ready text for each field on the BUIDL form. Every figure here was read off the
> live deployment, not estimated — see [Proof it runs](#proof-it-runs) for how to re-check
> any of them. Background: [product-spec.md](./product-spec.md),
> [technical-spec.md](./technical-spec.md),
> [attestcoin-integration.md](./attestcoin-integration.md).

---

## 1. Vision

> *Describe the problem which this project solves.* **125 / 125 words.**

A borrower who has repaid every loan on Aave has earned trust — but that trust is stranded
on the chain where it was earned. No lender elsewhere can see it without trusting a bridge
to move the data, or an operator to vouch for it. So every new lending relationship
restarts at zero, and DeFi falls back on the only thing it can verify locally:
over-collateralization. Careful borrowers and reckless ones post identical collateral.

Miro makes repayment history portable. Real Repay events from unmodified Aave V3 and
Morpho Blue are proven onto Creditcoin through the Attestcoin Protocol's Block Prover
Precompile — no bridge, no trusted reporter. The result is one on-chain credit passport
any lender can read, and that better borrowers can actually spend.

---

## 2. Category

**DeFi** — lending / credit infrastructure.

Secondary framing if a second tag is allowed: **Infrastructure**, since CreditPassport is
a read-only primitive any lending protocol can consume, not a lender itself.

---

## 3. Description

Miro turns repayment behaviour that already happens elsewhere into credit that is usable
here.

**How a score is earned.** Borrowers repay loans on real, unmodified protocols — Aave V3
and Morpho Blue on Sepolia. Miro changes nothing about that; it never asks anyone to
route through it. An off-chain worker watches each registered protocol for `Repay` events,
waits for the source block to be attested, fetches a Merkle + continuity proof, and submits
it to `CreditPassport` on Creditcoin. The Block Prover Precompile verifies the proof
on-chain. No operator signs anything, and no bridge moves any funds.

**How the score is computed.** Deterministically, from four terms, with no oracle:

| Term | Weight | Purpose |
|---|---|---|
| Repayments counted | 10 each, capped at 10 per source | Rewards repayment, and stops one protocol paying forever |
| Source diversity | 20 per source beyond the first | History across protocols is harder to fake than history on one |
| Passport age | 5 per 30 days, capped at 6 periods | A record has to survive time |
| Negative events | −50 each | Liquidations are registrable as sources too, and subtract |

**How the score is spent.** `PassportPool`, a reference lender on Creditcoin, reads
`scoreOf(borrower)` and raises the borrower's loan-to-value ceiling from a 50% base toward
a hard 75% cap — `maxLtvBps = min(5000 + min(score, 250) × 10, 7500)`, the two ceilings
meeting exactly at a score of 250. The passport narrows the
collateral gap; it never removes it. Full repayments on PassportPool are reported back
into the same passport, so credit built anywhere is spendable here, and credit built here
is readable anywhere else.

**Sources are configuration, not code.** Registering a new protocol or a new source chain
is one `setSource` call describing where the borrower and amount sit in that event's log.
Nothing about any chain is hardcoded.

---

## 4. Progress during the hackathon

Deployed and verified end-to-end on live testnets. Not a mock — the run below is real.

**One borrower's score, built from three independent sources:**

| Step | Source | Score | Max LTV |
|---|---|---|---|
| Local repayment on PassportPool | 1st | 10 | 51% |
| Repay on **Aave V3**, proven cross-chain | 2nd | **40** | — |
| Repay on **Morpho Blue**, proven cross-chain | 3rd | **70** | — |
| Second local repayment | — | **80** | **58%** |

The jump from 10 to 40 is one repayment plus the first diversity bonus; 40 to 70 is the
second.

What that buys: the same 1,000 tCTC of collateral supported a $500 credit line at score 0
and supports $580 at score 80 — the collateral did not change, the terms did. (The live
wallet reads $609 because the E2E run also deposited 50 tCTC more; $580 is the
reputation-only figure.)

**Shipped:**

- `CreditPassport.sol` — proof verification, config-driven source registry, replay
  protection keyed on (chainKey, blockHeight, txIndex), mandatory receipt-status check
- `PassportPool.sol` — over-collateralized lending, score-scaled LTV, LP side, local
  repayment reporting
- Off-chain worker — event watcher, attestation wait, proof fetch, submission, with a
  self-contained E2E script covering the whole path
- Next.js dashboard — passport with a per-source breakdown read out of the registry's own
  event log, borrow/lend flows, faucet
- 108 automated tests across worker and web

---

## Proof it runs

Everything below is live and independently checkable.

**Creditcoin CC3 Testnet** (chain `102031`)

| Contract | Address |
|---|---|
| CreditPassport | `0xF7F1E82CFA97d07812D8a61DD4c05B1C228f5851` |
| PassportPool | `0x027a17E704B5641e6b2525415265133190b47FdB` |
| TestUSDC | `0xc2706681eC25d9823882A7f80040579501d9bc16` |
| PriceOracle | `0x78c46a57fc1c8d60570d48BFc1BBC8f490669c50` |

**Sepolia** — Aave V3 and Morpho Blue at their own real deployments, unmodified. See
[attestcoin-integration.md](./attestcoin-integration.md) for the exact addresses and event
shapes.

**The two cross-chain proofs, on CC3:**

- Aave `Repay` relayed → `0x85ac6ad9c60b8b8b25d896eb1f62486b820747637af3232b956ddad869e20281`
- Morpho `Repay` relayed → `0x1ec083c125b85b4b1ef985051fececae3c2d0dc92765f52af9a67c1188da0d39`

Reproduce with `pnpm worker:e2e`. It runs the whole path — Aave faucet, supply, borrow,
repay, attest, prove, verify, then the same for Morpho, then a local PassportPool loop.

---

## What this does not do

Stated plainly, because a credit system that oversells itself is worse than none.

- **Sybil resistance is partial, not solved.** Borrow-repay cycling to farm score costs
  real gas and interest, `PER_SOURCE_CAP` stops one source paying after ten counted
  repayments, and only *full* repayments above a floor are reported. It is not eliminated.
  This is the largest un-mitigated risk in the design.
- **No identity binding.** A borrower can abandon a wallet and start fresh with no history.
  Self-limiting rather than exploitable — a fresh wallet gets base terms.
- **One source chain today.** CC3 Testnet currently attests Sepolia only. `chainKey` is
  resolved at runtime and never hardcoded, so a second chain is a config change — but it
  is a limitation now, not a solved problem.
- **No liquidation engine.** LTV is hard-capped at 75% and every position stays
  over-collateralized, which is what makes that omission survivable at this stage.
