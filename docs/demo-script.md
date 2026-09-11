# Demo script

Recorded as four shorts against the live deployments, then cut together. Attestation on
CC3 Testnet trails Sepolia by about seven minutes, so the flow cannot be one take.

## Before recording

- Fresh wallet: Sepolia ETH ≥ 0.05, tCTC ≥ 100, score 0.
- `E2E_BORROWER_PRIVATE_KEY` set to it, then `pnpm worker:seed-loans` — opens ~300 LINK of
  debt on Aave (health ≈ 2.5) and 1,000 tokens on Morpho, with enough of each asset in the
  wallet to close them in-app. Run it once; a second run stacks another position.
- Worker up and scanning (`docker compose logs worker` shows the cursor advancing).
- Wallet on Sepolia. Reload the app once to confirm the session survives it.

## 1 · Landing and a blank passport (~30 s)

Landing, then `/dashboard`. Score 0, three registered sources, none credited. Pools: 50%
LTV, and under it two open loans on Aave and Morpho, read live from Sepolia. Etherscan for
the borrow transactions if the beat needs proof it is real.

## 2 · Repay in-app (~60 s), then wait

`/dashboard/pool` → Loans on other chains → `Repay` on Aave. Two signatures. The row
flips to Settled within a poll. Then the same on Morpho.

Cut. Wait ~8 minutes. Tail the worker log meanwhile.

## 3 · Relay and score (~40 s)

Worker log: `queued` → `not yet attested … retrying` → `submitted`. Passport: score
0 → 10 after Aave, 10 → 40 after Morpho (two repays, plus the diversity bonus for a second
source). Sources show one repay each. Pools: LTV 50% → 54%.

## 4 · The loop closes on Creditcoin (~60 s)

Wallet to CC3. Deposit 100 tCTC — credit limit reads $54 at the boosted LTV. Borrow 30
tUSDC, repay 31.5 (5% flat; faucet tUSDC first if needed). Passport: 40 → 70 immediately —
PassportPool reports as a local source, no proof required — and LTV to 57%.

## Traps

- Repay below `MIN_CREDIT_LOAN` (10 tUSDC cumulative principal) is not reported.
- Both worker instances must not run at once: the loser's submit reverts on replay
  protection. Harmless, but the log shows a failure.
- If the score has not moved ten minutes after `submitted`, check the worker log before
  suspecting the contract; attestation has been slower than seven minutes.
- Re-recording needs a fresh wallet or another seed run; repaid positions do not reopen.
