# DoraHacks BUIDL — submission copy

> Paste-ready text for each field on the BUIDL form. Every figure was read off the live
> deployment, not estimated. Field limits differ per field and have changed once already —
> check the form before pasting.
>
> Background: [product-spec.md](./product-spec.md),
> [technical-spec.md](./technical-spec.md),
> [attestcoin-integration.md](./attestcoin-integration.md).

---

## 1. Vision

> *Describe the problem which this project solves.* The form caps this at **256
> characters**, not words — the long-form version lives in
> [product-spec.md §1.2](./product-spec.md).

Repayment history is trapped on the chain where it was earned. No lender elsewhere can verify it without trusting a bridge or an oracle. So every loan starts from zero, and DeFi falls back on over-collateralization: good borrowers pay for bad ones.

*248 / 256 characters.*

---

## 2. Category

**DeFi** — lending / credit infrastructure.

Secondary framing if a second tag is allowed: **Infrastructure**, since CreditPassport is
a read-only primitive any lending protocol can consume, not a lender itself.

---

## 3. Details

> The BUIDL form's main Markdown field. Paste from here, not from the README: the README
> is written for someone who has already cloned the repo, and every link in it is
> repo-relative and would break here. All links below are absolute.

### The problem

A borrower who has repaid every loan on Aave has earned trust — but that trust is stranded
on the chain where it was earned. No lender elsewhere can verify it without trusting a
bridge to move the data, or an operator to vouch for it. So every new lending relationship
restarts at zero, and DeFi falls back on the only thing it can verify locally:
over-collateralization. Careful borrowers and reckless ones post identical collateral.

### What Miro does

Miro turns repayment behaviour that already happens elsewhere into credit that is usable
here.

**Earning a score.** Borrowers repay loans on real, unmodified protocols — Aave V3 and
Morpho Blue on Ethereum Sepolia. Miro changes nothing about that and never asks anyone to
route through it. An off-chain worker watches each registered protocol for `Repay` events,
waits for the source block to be attested, fetches a Merkle and continuity proof, and
submits it to `CreditPassport` on Creditcoin. The **Block Prover Precompile** verifies the
proof on-chain. No operator signs anything, and no bridge moves any funds.

**Computing it.** Deterministically, from four terms, with no oracle:

| Term | Weight | Why |
|---|---|---|
| Repayments counted | 10 each, capped at 10 per source | Rewards repayment, stops one protocol paying forever |
| Source diversity | 20 per source beyond the first | History across protocols is harder to fake than history on one |
| Passport age | 5 per 30 days, capped at 6 periods | A record has to survive time |
| Negative events | −50 each | Liquidations are registrable as sources too, and subtract |

**Spending it.** `PassportPool`, a reference lender on Creditcoin, reads
`scoreOf(borrower)` and raises the loan-to-value ceiling from a 50% base toward a hard 75%
cap: `maxLtvBps = min(5000 + min(score, 250) × 10, 7500)`. The passport narrows the
collateral gap; it never removes it. Full repayments on PassportPool are reported back into
the same passport it reads from, so credit built anywhere is spendable here, and credit
built here is readable anywhere else.

**Sources are configuration, not code.** Registering a new protocol or a new source chain
is one `setSource` call describing where the borrower and amount sit in that event's log.
Nothing about any chain is hardcoded.

### It runs — here is the evidence

One wallet, one passport, three independent sources, on live testnets:

| Step | Score | Max LTV |
|---|---|---|
| Local repayment on PassportPool | 10 | 51% |
| Repay on Aave V3, proven cross-chain | 40 | — |
| Repay on Morpho Blue, proven cross-chain | 70 | — |
| Second local repayment | 80 | 58% |

The same 1,000 tCTC of collateral backed a $500 credit line at score 0 and $580 at score
80. The collateral did not change; the terms did.

The two cross-chain proofs, verified on Creditcoin CC3 Testnet:

- Aave `Repay` — `0x85ac6ad9c60b8b8b25d896eb1f62486b820747637af3232b956ddad869e20281`
- Morpho `Repay` — `0x1ec083c125b85b4b1ef985051fececae3c2d0dc92765f52af9a67c1188da0d39`

Deployed on CC3 Testnet (chain `102031`):

| Contract | Address |
|---|---|
| CreditPassport | `0xF7F1E82CFA97d07812D8a61DD4c05B1C228f5851` |
| PassportPool | `0x027a17E704B5641e6b2525415265133190b47FdB` |
| TestUSDC | `0xc2706681eC25d9823882A7f80040579501d9bc16` |
| PriceOracle | `0x78c46a57fc1c8d60570d48BFc1BBC8f490669c50` |

Aave V3 and Morpho Blue are their own real Sepolia deployments, used unmodified. Proving
external repayment behaviour is the point, not reimplementing lending.

Reproduce the whole path with `pnpm worker:e2e`.

### What it does not do

Stated plainly, because a credit system that oversells itself is worse than none.

- **Sybil resistance is partial, not solved.** Borrow-repay cycling to farm score costs
  real gas and interest, a per-source cap stops one protocol paying after ten counted
  repayments, and only *full* repayments above a floor are reported. It is not eliminated,
  and this is the largest un-mitigated risk in the design.
- **No identity binding.** A borrower can abandon a wallet and start fresh with no history.
  Self-limiting rather than exploitable: a new wallet gets base terms.
- **One source chain today.** CC3 Testnet attests Sepolia only. `chainKey` is resolved at
  runtime and never hardcoded, so a second chain is configuration — but it is a present
  limitation, not a solved problem.
- **No liquidation engine.** Every position stays over-collateralized and LTV is capped at
  75%, which is what makes that omission survivable at this stage.

### Links

- Repository — https://github.com/HoangDucBach/miro
- Product spec — https://github.com/HoangDucBach/miro/blob/main/docs/product-spec.md
- Technical spec — https://github.com/HoangDucBach/miro/blob/main/docs/technical-spec.md
- Attestcoin integration — https://github.com/HoangDucBach/miro/blob/main/docs/attestcoin-integration.md
