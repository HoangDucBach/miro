# Attestcoin Integration Summary

> **Required by the hackathon submission** (§1.8). This is the deep-dive on *how* and *why*
> Miro uses the Attestcoin Protocol, and an honest accounting of what it does and
> does not guarantee.
>
> **2026-08-27 pivot note**: Miro moved from collateral-based designs (salary streams, then
> token vesting) to a cross-chain credit passport — see
> [technical-spec.md §2.10](./technical-spec.md#210-migration-to-the-cross-chain-credit-passport-current-design)
> for why this is the design that genuinely can't be reproduced without Creditcoin, unlike
> the two collateral-based ones before it. This doc describes the current design; the
> **Deployed addresses** section below still shows a prior deployment and is pending a
> fresh one.

## What we prove, and why

Miro needs to answer one question trustlessly: *did this borrower really repay a real
loan, on a real protocol, on another chain?* That requires proving `Repay` events emitted
by protocols Miro doesn't control, on Creditcoin, without a trusted oracle operator:

| Source | Why we prove it |
|---|---|
| Aave V3 `Repay` (Sepolia, real deployment) | A real, unmodified lending protocol's own record of a borrower clearing their debt |
| Morpho Blue `Repay` (Sepolia, real deployment) | A second, independent protocol — proves the design generalizes, not a one-off integration |
| `PassportPool.recordLocalRepay` (same-chain, no proof) | Feedback loop: the reference lending pool built on Creditcoin also contributes to the same passport it reads from |

Both real events turned out to have **more indexed fields than a first-glance assumption
would suggest** — verified directly against each protocol's own source rather than assumed,
since getting this wrong would silently credit the wrong address:

- Aave's `Repay(address indexed reserve, address indexed user, address indexed repayer, uint256 amount, bool useATokens)` — `reserve`, `user`, **and** `repayer` are all indexed. The borrower (`user`) is topic 2, not a data word.
- Morpho's `Repay(Id indexed id, address indexed caller, address indexed onBehalf, uint256 assets, uint256 shares)` — `id`, `caller`, **and** `onBehalf` are all indexed. The borrower (`onBehalf`) is topic 3.

## How verification works

1. The worker ([apps/worker/src/index.ts](../apps/worker/src/index.ts)) watches each
   registered source contract for its specific `Repay` topic and enqueues matches (BullMQ,
   Redis-backed).
2. It waits for the source block to be attested (`waitUntilHeightAttested`), then requests
   a Merkle + continuity proof from the Prover service
   ([apps/worker/src/lib/proof.ts](../apps/worker/src/lib/proof.ts)).
3. It submits the proof to
   [`CreditPassport.processAttestation`](../contracts/creditcoin/src/CreditPassport.sol),
   which:
   - rejects replays via `processedQueries[txKey]`,
   - calls the Block Prover Precompile at `0x0FD2` (`verifyAndEmit`) — this is the
     trust-minimized step; verification happens synchronously, on-chain, in the same
     transaction,
   - **decodes the transaction receipt and requires `receiptStatus == 1`** — this is
     mandatory and easy to get wrong: the precompile proves the transaction was *included*,
     not that it *succeeded*,
   - looks up `sources[sourceIdFor(chainKey, log.address, log.topics[0])]` per log — an
     unregistered emitter or signature is silently skipped, not routed,
   - decodes the borrower and amount from whichever topic/data-word the registered
     `SourceConfig` points at, so Aave's and Morpho's very different layouts both work
     through the same code path,
   - skips (doesn't revert) any log below the source's configured `minAmount`, or any log
     whose shape doesn't match — one malformed log can't sink an otherwise-valid proof.

## Depth of utilization

- **Two independent, real, third-party protocols proven cross-chain** — not a contract
  Miro wrote itself, and not just one integration. Generalizing across Aave and Morpho's
  genuinely different event shapes is the actual engineering demonstration.
- **Receipt-status validation** enforced at the passport level, not left to convention.
- **Replay protection** via `(chainKey, blockHeight, txIndex)`-keyed `processedQueries`.
- **Config-driven source injection**: adding a third protocol, or a second source chain
  the moment Creditcoin supports one, is one `setSource` call — never a redeploy.
- **Negative-event support**: a source can be registered to subtract score (e.g. Aave's
  `LiquidationCall`), so a default costs reputation instead of merely failing to build it.
- **Closed feedback loop**: `PassportPool` is both a consumer (reads `scoreOf` for LTV) and
  a producer (`recordLocalRepay`) of the same passport — credit built anywhere is usable
  there, and vice versa.

## Trust model — stated honestly

See [product-spec.md §1.6](./product-spec.md#16-trust--risk-model-state-honestly-in-submission)
for the full table. The gaps worth being explicit about in a demo/judging context:

1. **Sybil / self-repay farming**: nothing stops a borrower from cycling small loans
   through a source to inflate score, other than gas + interest cost, `PER_SOURCE_CAP`
   (diminishing returns per source), and `minAmount` floors. Stated as the largest
   un-mitigated MVP risk, not hidden.
2. **No KYC**: a wallet's history doesn't survive abandoning it for a new one. Self-limiting
   (a fresh wallet just starts at base terms), not a hard failure.
3. **Only one public testnet source chain exists today**: CC3 Testnet supports Sepolia only
   (verified against Creditcoin's own `gluwa/creditcoin-usc-networks` config, not docs
   prose). `SourceConfig.chainKey` is never hardcoded in the contract, so this is a real,
   current infrastructure limitation stated honestly — not a design flaw.

## Deployed addresses

**Live, deployed 2026-08-27.** `EvmV1Decoder` and `TestUSDC`/`FixedPriceOracle` are reused
from a prior deployment round (same bytecode, unaffected by any pivot); `CreditPassport`
and `PassportPool` are fresh for the credit-passport design.

**CC3 Testnet:**

| Contract | Address |
|---|---|
| EvmV1Decoder (library, reused) | `0x821EA1E92283fDDAde6E4F192370Dc2F9f5a83e2` |
| TestUSDC (reused) | `0xc2706681eC25d9823882A7f80040579501d9bc16` |
| FixedPriceOracle (reused, price reset to `1e8` = $1/tCTC) | `0x78c46a57fc1c8d60570d48BFc1BBC8f490669c50` |
| CreditPassport | `0xF7F1E82CFA97d07812D8a61DD4c05B1C228f5851` |
| PassportPool | `0x027a17E704B5641e6b2525415265133190b47FdB` |

Wiring confirmed on-chain: `passport.localReporters(pool) == true`; both sources
registered and `enabled == true` (`sources(sourceIdFor(1, aavePool, AaveRepayTopic))` and
the Morpho equivalent); `oracle.price() == 1e8`.

**Sepolia (demo Morpho market assets, `contracts/source`):**

| Contract | Address |
|---|---|
| DemoToken (loan) | `0x487e4801EDD42bfd5B39857053dc9C0F8f2AC652` |
| DemoToken (collateral) | `0x1FC6A05B43F208beD57Fa09350322A375DA86714` |
| FixedMorphoOracle | `0x7A1e6BDdbA6D5c05536a0fc823F92e2dA9E3B294` |

**Real, unmodified Sepolia protocols** (verified 2026-08-27 against each project's own
address book / deployment repo, not docs prose):

| Contract | Address | Source |
|---|---|---|
| Aave V3 Pool | `0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951` | `bgd-labs/aave-address-book` |
| Aave V3 Faucet | `0xC959483DBa39aa9E78757139af0e9a2EDEb3f42D` | same — confirmed **not permissioned** (anyone can mint) |
| Aave V3 LINK (reserve asset used) | `0xf8Fb3713D459D7C1018BD0A49D19b4C44290EBE5` | same — confirmed `supplyCap = 0` (uncapped). DAI/USDC/USDT all sit above their 2B supply cap already, from public testnet usage over time — real, live-verified finding, not a code issue |
| Morpho Blue | `0xd011ee229e7459ba1ddd22631ef7bf528d424a14` | `morpho-org/morpho-blue-deployment` broadcast, chain `11155111` |
| Morpho AdaptiveCurveIRM | `0x8c5ddcd3f601c91d1bf51c8ec26066010acaba7c` | same broadcast — confirmed `isIrmEnabled == true` |
| Morpho LLTV tier used | `860000000000000000` (86%) | confirmed `isLltvEnabled == true` |

**Deployment note**: `forge script Deploy.s.sol` panics against CC3 Testnet
(`prevrandao not set`) — Foundry's local simulation step expects a post-merge Ethereum
block header field that CC3's blocks don't carry. Worked around by deploying each
contract individually with `forge create` and wiring afterward with `cast send`:

```bash
forge create src/CreditPassport.sol:CreditPassport --legacy --broadcast \
  --libraries src/libs/EvmV1Decoder.sol:EvmV1Decoder:0x821EA1E92283fDDAde6E4F192370Dc2F9f5a83e2 ...
forge create src/PassportPool.sol:PassportPool --legacy --broadcast \
  --constructor-args <usdc address> <passport address> <oracle address> ...
cast send <passport address> "setLocalReporter(address,bool)" <pool address> true --legacy ...
cast send <passport address> "setSource((uint64,address,bytes32,uint8,uint8,uint8,uint256,bool,bool))" \
  "(1,<aave pool>,<AaveRepay topic0>,1,0,0,10000000000000000000,false,true)" --legacy ...
cast send <passport address> "setSource((uint64,address,bytes32,uint8,uint8,uint8,uint256,bool,bool))" \
  "(1,<morpho>,<MorphoRepay topic0>,2,0,0,10000000000000000000,false,true)" --legacy ...
```

## Live E2E run — 2026-08-27

`apps/worker/src/e2e.ts` ran end to end against the deployment above, twice in a row, with
identical results each time. Score progressed exactly per the formula in §2.3.1:

| Step | Action | `scoreOf(borrower)` |
|---|---|---|
| Start | — | 0 |
| Aave V3 repay (real, LINK) → relayed | +1 source, 1 repay | 10 |
| Morpho Blue repay (real, demo market) → relayed | +1 source (diversity bonus) | 40 |
| PassportPool local borrow/repay loop → self-reported | +1 source (diversity bonus) | 70 |

`PassportPool.maxLtvBps(borrower)` moved from the 50% base to 54% (score 40) to 57% (score
70) across the run — the passport score visibly changing real loan terms, not just a
display number.

Two real bugs were found and fixed only by running against live infrastructure, not
caught by any unit test:

1. **Missing ABI getter**: `CREDIT_PASSPORT_ABI` never declared `localReporters(address)`
   (the contract's own public mapping getter), so the worker script crashed calling it.
2. **Morpho over-repayment**: repaying via `assets` set to 2x the borrowed principal (to
   cover accrued interest) makes Morpho convert more assets into shares than the position
   actually borrowed, underflowing `borrowShares -= sharesRepaid` and panicking. Fixed by
   repaying via `shares` (querying `position(id, borrower).borrowShares` first) instead —
   exactly what Morpho's own docs recommend for closing a position in full.

One transient issue was also found and mitigated: a public Sepolia RPC's likely multi-node
replication lag caused a `borrow()` call to occasionally revert right after the `supply()`
it depended on, even though a static replay of the identical call succeeded moments later
and on-chain account health data showed no real constraint violated. Waiting for 2 block
confirmations (instead of 1) on every state-changing tx resolved it.

## TODO

- [x] Deploy CreditPassport + PassportPool, wire sources + local reporter
- [x] Live-verify the Morpho market bootstrap (`isLltvEnabled`/`isIrmEnabled`) and Aave
      faucet behavior — both confirmed against live testnet before deploying
- [x] Run `apps/worker/src/e2e.ts` live end to end — see the run log above
- [ ] Example `txKey` and a link to the on-chain `AttestationProcessed` event for each
      source
- [ ] Screenshot/log of a rejected replay attempt
- [ ] Screenshot/log of a rejected failed-source-tx proof (`receiptStatus == 0`)
- [ ] Batch proof example, if implemented in time
