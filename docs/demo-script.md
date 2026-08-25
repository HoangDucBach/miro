# Demo Video Script (≤5 min)

> Backing implementation: [apps/worker/src/e2e.ts](../apps/worker/src/e2e.ts).
> Per §2.6: attestation wait is minutes-scale on testnet — **pre-record segments, do not
> run this fully live.**

## Segments

1. **(0:00–0:30) Problem framing** — DeFi over-collateralization excludes people whose
   asset is future income, not capital. Show the one-liner.
2. **(0:30–1:15) Employer side (Sepolia)** — `EmployerRegistry.register()` (stake tCTC on
   Creditcoin), then `SalaryStream.createStream()` on Sepolia. Show both txs on their
   respective block explorers.
3. **(1:15–2:00) Attestcoin relay (pre-recorded, sped up)** — worker log output: event
   detected → `waitUntilHeightAttested` → proof fetched → `processStreamEvent` submitted.
   Cut to the `StreamEventProcessed` event on the CC3 explorer.
4. **(2:00–2:45) Borrow** — show `CreditPool.creditLimit()` reflecting `remainingLocked()`,
   then `borrow()` succeeding within the 50% LTV cap.
5. **(2:45–3:30) Withdraw + garnish** — borrower withdraws salary on Sepolia; after the
   relay, show `pendingGarnish` populated and a `borrow()` call reverting with
   `"settle garnish first"`.
6. **(3:30–4:15) Settle + LTV growth** — `settleGarnish()`, full `repay()`, then show
   `repaidLoans` incrementing and the next `creditLimit()` reflecting the higher LTV tier.
7. **(4:15–5:00) Trust model close** — one slide: what's cryptographically enforced
   (receipt-status check, replay protection, on-chain proof verification) vs. what's an
   honest MVP limitation (cross-chain enforcement gap, stake-based employer identity).
   Link to [attestcoin-integration.md](./attestcoin-integration.md).

## TODO

- [ ] Record each segment against real CC3 Testnet + Sepolia deployments
- [ ] Confirm final timings once `e2e.ts` TODOs (see file) are filled in and timed on testnet
- [ ] Decide on screen-capture tool and narration approach
