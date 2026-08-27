# Demo Video Script (≤5 min)

> Backing implementation: [apps/worker/src/e2e.ts](../apps/worker/src/e2e.ts).
> Per §2.6: attestation wait is minutes-scale on testnet — **pre-record segments, do not
> run this fully live.** Demo vesting stream duration: 15–30 min (see §2.6 rationale).

## Segments

1. **(0:00–0:30) Problem framing** — DeFi over-collateralization excludes people whose
   asset is already-committed future value, not liquid capital. Show the one-liner:
   borrow against your unvested token grant, no early sale needed.
2. **(0:30–1:15) A real vesting stream, not a fake one** — mint the demo `NEBULA` token,
   create a Lockup Linear stream on Sepolia via Sablier's real, unmodified
   `SablierLockup` contract (`0xe61cb9153356419bdad0a8767c059f92d221a3c4`). Show the tx on
   Sepolia Etherscan and the Lockup NFT appearing in the borrower's wallet — this is the
   credibility beat: point out this is a live third-party protocol, not something we wrote.
3. **(1:15–1:35) Safety check** — attempt to use a `cancelable` stream as collateral and
   show it get rejected (`isCancelable() == true`); then show the real, non-cancelable
   stream from segment 2 getting accepted. Establishes that Miro filters risk before
   accepting collateral, not just after something goes wrong.
4. **(1:35–2:20) Attestcoin relay (pre-recorded, sped up)** — worker log output: event
   detected on `SablierLockup` → `waitUntilHeightAttested` → proof fetched →
   `processStreamEvent` submitted. Cut to the `StreamEventProcessed` event on the CC3
   explorer.
5. **(2:20–3:00) Borrow** — show `CreditPool.creditLimit()` reflecting the vested-vs-locked
   split priced through NEBULA's oracle, then `borrow()` succeeding within the LTV cap
   (lower than a blue-chip-collateral cap, because NEBULA is a thin-liquidity demo token).
6. **(3:00–3:45) Withdraw + garnish** — borrower calls `SablierLockup.withdraw()` on
   Sepolia; after the relay, show `pendingGarnish` populated and a `borrow()` call
   reverting with `"settle garnish first"`.
7. **(3:45–4:20) Settle + LTV growth** — `settleGarnish()`, full `repay()`, then show
   `repaidLoans` incrementing and the next `creditLimit()` reflecting the higher LTV tier.
8. **(4:20–5:00) Trust model close** — one slide: what's cryptographically enforced
   (receipt-status check, replay protection, on-chain proof verification, one-way
   `renounce()` guarantee on the cancelable check) vs. what's an honest MVP limitation
   (cross-chain enforcement gap, oracle risk on thin-liquidity collateral, the Lockup NFT
   being transferable mid-loan with no escrow yet). Link to
   [attestcoin-integration.md](./attestcoin-integration.md).

## TODO

- [ ] Record each segment against real CC3 Testnet + Sepolia deployments, once the
      migration in [technical-spec.md §2.9](./technical-spec.md#29-migration-to-the-token-vesting-design-post-day-16-pivot)
      is done
- [ ] Decide which demo token price path to show in segment 5/8 — a controlled admin-set
      price (simple, matches the old `FixedPriceOracle` pattern) vs. a real feed pointed at
      a low-liquidity pair (more honest about the oracle risk, harder to script precisely)
- [ ] Decide on screen-capture tool and narration approach
