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

> **Stale — from a prior design.** Kept here as a historical record; not valid for the
> current credit-passport design. Pending a fresh deployment — see
> [README.md §Deploying](../README.md#deploying).

**CC3 Testnet (prior salary-stream / token-vesting deployment):**

| Contract | Address |
|---|---|
| TestUSDC | `0xc2706681eC25d9823882A7f80040579501d9bc16` |
| EvmV1Decoder (library) | `0x821EA1E92283fDDAde6E4F192370Dc2F9f5a83e2` |
| FixedPriceOracle | `0x78c46a57fc1c8d60570d48BFc1BBC8f490669c50` |

**Deployment note**: `forge script Deploy.s.sol` panics against CC3 Testnet
(`prevrandao not set`) — Foundry's local simulation step expects a post-merge Ethereum
block header field that CC3's blocks don't carry. Worked around by deploying each
contract individually with `forge create` (which skips that simulation step) and wiring
them together afterward with `cast send`. For the current design:

```bash
forge create src/libs/EvmV1Decoder.sol:EvmV1Decoder --legacy --broadcast ...
forge create src/TestUSDC.sol:TestUSDC --legacy --broadcast ...
forge create src/FixedPriceOracle.sol:FixedPriceOracle --legacy --broadcast \
  --constructor-args <initial price, 8 decimals> ...
forge create src/CreditPassport.sol:CreditPassport --legacy --broadcast \
  --libraries src/libs/EvmV1Decoder.sol:EvmV1Decoder:<decoder address> ...
forge create src/PassportPool.sol:PassportPool --legacy --broadcast \
  --constructor-args <usdc address> <passport address> <oracle address> ...
cast send <passport address> "setLocalReporter(address,bool)" <pool address> true --legacy ...
cast send <passport address> "setSource((uint64,address,bytes32,uint8,uint8,uint8,uint256,bool,bool))" \
  "(1,<aave pool>,<AaveRepay topic0>,1,0,0,<minAmount>,false,true)" --legacy ...
cast send <passport address> "setSource((uint64,address,bytes32,uint8,uint8,uint8,uint256,bool,bool))" \
  "(1,<morpho>,<MorphoRepay topic0>,2,0,0,<minAmount>,false,true)" --legacy ...
```

**Real Sepolia protocol addresses** (verified 2026-08-27 against each project's own
address book / deployment repo, not docs prose):

| Contract | Address | Source |
|---|---|---|
| Aave V3 Pool | `0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951` | `bgd-labs/aave-address-book` |
| Aave V3 Faucet | `0xC959483DBa39aa9E78757139af0e9a2EDEb3f42D` | same |
| Aave V3 DAI | `0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357` | same |
| Morpho Blue | `0xd011ee229e7459ba1ddd22631ef7bf528d424a14` | `morpho-org/morpho-blue-deployment` broadcast, chain `11155111` |
| Morpho AdaptiveCurveIRM | `0x8c5ddcd3f601c91d1bf51c8ec26066010acaba7c` | same broadcast — re-verify at deploy time |

## TODO

- [ ] Redeploy CreditPassport + PassportPool under the current design, update the address
      table above
- [ ] Live-verify the Morpho market bootstrap (`isLltvEnabled`/`isIrmEnabled`) and Aave
      faucet behavior — both currently unverified against live testnet
- [ ] Example `txKey` and a link to the on-chain `AttestationProcessed` event for each
      source
- [ ] Screenshot/log of a rejected replay attempt
- [ ] Screenshot/log of a rejected failed-source-tx proof (`receiptStatus == 0`)
- [ ] Screenshot/log of the score visibly rising across both cross-chain sources plus the
      local reporter
- [ ] Batch proof example, if implemented in time
