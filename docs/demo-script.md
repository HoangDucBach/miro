# Demo Video Script (≤5 min)

> Backing implementation: [apps/worker/src/e2e.ts](../apps/worker/src/e2e.ts).
> Attestation wait is minutes-scale on testnet — **pre-record segments, do not run this
> fully live.**

## Segments

1. **(0:00–0:30) Problem framing** — a borrower's repayment history is real, but stuck
   wherever it was earned. No lender on a different chain can see it without a bridge or a
   centralized oracle. Miro attests it instead — cryptographically, once, portably.
2. **(0:30–1:20) A real repayment on Aave, not a fake one** — faucet DAI on Aave V3's real
   Sepolia Pool, supply, borrow, repay in full. Show the `Repay` tx on Sepolia Etherscan —
   this is the credibility beat: Aave is a live third-party protocol, we wrote none of it.
3. **(1:20–2:00) Attestcoin relay (pre-recorded, sped up)** — worker log output: `Repay`
   event detected → `waitUntilHeightAttested` → proof fetched → `processAttestation`
   submitted. Cut to `CreditPassport.scoreOf(borrower)` on the CC3 explorer ticking up from
   0 to 10.
4. **(2:00–2:50) A second, different protocol — Morpho** — supply collateral, borrow,
   repay in full on a Morpho Blue market. Relay it the same way. Show `scoreOf` jump by
   more than just the repay points: the **diversity bonus** for a second distinct source —
   this is the beat that makes "cross-chain, not single-protocol" visible on screen.
5. **(2:50–3:30) The score means something concrete** — show `PassportPool.maxLtvBps()`
   for this borrower before vs. after: base 50%, boosted by score, capped at 75% — never
   100%, always over-collateralized, stated on screen so it isn't overclaimed.
6. **(3:30–4:20) Borrow, repay, and the loop closes** — deposit native tCTC as collateral,
   borrow tUSDC at the boosted rate, repay in full. Show `scoreOf` tick up **again** — the
   same pool that just read the score also fed it, a third distinct source.
7. **(4:20–5:00) Trust model close** — one slide: what's cryptographically enforced
   (receipt-status check, replay protection, per-source anti-dust floor, config-driven
   decoding proven against two independently-verified event shapes) vs. what's an honest
   MVP limitation (sybil/self-repay farming still costs only gas + interest; no KYC; only
   Sepolia exists as a source chain on the public CC3 Testnet today, though nothing in the
   contract hardcodes that). Link to
   [attestcoin-integration.md](./attestcoin-integration.md).

## TODO

- [ ] Record each segment against real Sepolia + CC3 Testnet deployments, once
      [technical-spec.md §2.10](./technical-spec.md#210-migration-to-the-cross-chain-credit-passport-current-design)'s
      remaining checklist items are done
- [ ] Confirm Aave's Sepolia Faucet actually mints without friction for a fresh wallet —
      first live run will tell; have a fallback ready if it's permissioned
- [ ] Confirm the Morpho market bootstrap (LLTV/IRM enablement) live before recording
- [ ] Decide on screen-capture tool and narration approach
