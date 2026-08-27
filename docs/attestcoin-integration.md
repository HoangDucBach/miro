# Attestcoin Integration Summary

> **Required by the hackathon submission** (§1.8). This is the deep-dive on *how* and *why*
> Miro uses the Attestcoin Protocol, and an honest accounting of what it does and
> does not guarantee.
>
> **2026-08-26 pivot note**: Miro moved from a self-written salary-stream design to
> token-vesting collateral, read directly off Sablier's real, unmodified `SablierLockup`
> contract instead of a contract we wrote ourselves — see
> [technical-spec.md §2.9](./technical-spec.md#29-migration-to-the-token-vesting-design-post-day-16-pivot)
> for why. This doc describes the new design; the **Deployed addresses** section below is
> from the prior design and is pending a fresh deployment.

## What we prove, and why

Miro needs to answer one question trustlessly: *is this borrower's vesting position
real, and how much of it remains locked?* That requires proving lifecycle events emitted
by Sablier's real `SablierLockup` contract on Ethereum Sepolia, on Creditcoin, without a
trusted oracle operator:

| Event | Why we prove it |
|---|---|
| `CreateLockupLinearStream` | Establishes the collateral base (`depositAmount`, vesting window, token) — only accepted if the stream is provably `!cancelable && !transferable` |
| `WithdrawFromLockupStream` | Triggers the garnishment obligation (`CreditPool.onTokenWithdrawn`) |

`CancelLockupStream` is deliberately **not** proven or routed at all: since only
non-cancelable streams are ever accepted as collateral, a legitimate cancel can never
target a stream Miro is tracking — there's nothing for that event to do here.

## How verification works

1. The worker ([apps/worker/src/index.ts](../apps/worker/src/index.ts)) detects a
   `SablierLockup` event and enqueues it (BullMQ, Redis-backed).
2. It waits for the source block to be attested (`waitUntilHeightAttested`), then requests
   a Merkle + continuity proof from the Prover service
   ([apps/worker/src/lib/proof.ts](../apps/worker/src/lib/proof.ts)).
3. It submits the proof to
   [`StreamVerifierASC.processStreamEvent`](../contracts/creditcoin/src/StreamVerifierASC.sol),
   which:
   - rejects replays via `processedQueries[txKey]`,
   - calls the Block Prover Precompile at `0x0FD2` (`verifyAndEmit`) — this is the
     trust-minimized step; verification happens synchronously, on-chain, in the same
     transaction,
   - **decodes the transaction receipt and requires `receiptStatus == 1`** — this is
     mandatory and easy to get wrong: the precompile proves the transaction was *included*,
     not that it *succeeded*. A borrower could otherwise submit a proof of a *reverted*
     `withdraw()` call and have it treated as a real withdrawal,
   - filters logs to only those emitted by the known `SOURCE_SABLIER_LOCKUP` address, so a
     proof of an unrelated contract's event can't be routed into `StreamRecord` state,
   - **rejects the stream outright if `cancelable` or `transferable` is true** — decoded
     directly from the event's own data, not a separate cross-chain call. Neither flag can
     ever flip back once set (Sablier's `renounce()` is one-directional,
     cancelable → non-cancelable, and transferability has no setter at all), so this check
     made once at stream-registration time is a permanent guarantee, not a snapshot.

## Depth of utilization

- **A real, third-party protocol's live state proven cross-chain** — not a contract Miro
  wrote itself, which is closer to what Attestcoin/Creditcoin's own thesis is actually
  built for (see product-spec.md §1.1) than proving a bespoke contract would be.
- **Receipt-status validation** enforced at the ASC level, not left to convention.
- **Replay protection** via `(chainKey, blockHeight, txIndex)`-keyed `processedQueries`.
- **Per-token collateral pricing**: `CreditPool` holds a whitelist of accepted collateral
  tokens, each with its own price oracle and LTV, instead of a single hardcoded asset.
- **Batch proofs** (stretch, §2.1): `getBatchProof` support wired into
  [proof.ts](../apps/worker/src/lib/proof.ts) for up to 10 tx sharing one continuity proof.
- **Split-contract architecture**: `StreamVerifierASC` only verifies and records facts;
  `CreditPool` holds all money logic — keeps the audit surface of the proof-handling code
  small.

## Trust model — stated honestly

See [product-spec.md §1.6](./product-spec.md#16-trust--risk-model-state-honestly-in-submission)
for the full table. The gaps worth being explicit about in a demo/judging context:

1. **Cross-chain enforcement gap**: a loan lives on Creditcoin, the vested token lives on
   Ethereum. Miro cannot seize Ethereum-side funds to enforce garnishment —
   `pendingGarnish` is an obligation ledger, and funds only move when the borrower calls
   `settleGarnish` on Creditcoin. The LTV cap against *unvested* value is the actual lender
   protection, not the garnishment mechanism itself.
2. **Oracle risk on thin-liquidity collateral**: unlike the original ETH-only design,
   collateral can now be any whitelisted ERC-20, including thin-liquidity tokens whose
   price is easier to manipulate than a blue-chip asset's. Mitigated by admin-curated
   whitelisting and lower per-token LTVs, not eliminated — there is still no liquidation
   engine (§1.7).
3. **Stream NFT is transferable-by-default on Sablier, but Miro only accepts
   non-transferable streams** — so for any stream Miro actually accepts as collateral, the
   recipient identity is permanent and this specific risk doesn't apply. It only matters if
   that filter is ever loosened.

## Deployed addresses

> **Stale — from the prior salary-stream design.** Kept here as a historical record of a
> real, working deployment; not valid for the current token-vesting design. Pending a
> fresh deployment — see [README.md §Deploying](../README.md#deploying).

**Sepolia:**

| Contract | Address |
|---|---|
| SalaryStream (retired) | [`0xEEe9f75C93ac2D4B568Ff884A4b08D1a55345b7F`](https://sepolia.etherscan.io/address/0xEEe9f75C93ac2D4B568Ff884A4b08D1a55345b7F) |

**CC3 Testnet:**

| Contract | Address |
|---|---|
| EmployerRegistry (retired) | `0x7767A97fC07906EB87CA3cA158DC6D2FdC47e511` |
| TestUSDC | `0xc2706681eC25d9823882A7f80040579501d9bc16` |
| EvmV1Decoder (library) | `0x821EA1E92283fDDAde6E4F192370Dc2F9f5a83e2` |
| FixedPriceOracle | `0x78c46a57fc1c8d60570d48BFc1BBC8f490669c50` |
| StreamVerifierASC (prior design) | `0x4D937Ed2A70FDCB97602B41F11081dE5f178ebD1` |
| CreditPool (prior design) | `0xf3919e85B308a3FD9a32F771AfB55EbB904964A5` |

`asc.pool()` was checked on-chain and matched the CreditPool address above at the time,
confirming the wiring was correct for that deployment.

**Deployment note**: `forge script Deploy.s.sol` panics against CC3 Testnet
(`prevrandao not set`) — Foundry's local simulation step expects a post-merge Ethereum
block header field that CC3's blocks don't carry. Worked around by deploying each
contract individually with `forge create` (which skips that simulation step) and wiring
them together afterward with `cast send`, in place of the single `Deploy.s.sol` run. For
the current design (no EmployerRegistry, no SalaryStream), the equivalent commands are:

```bash
forge create src/libs/EvmV1Decoder.sol:EvmV1Decoder --legacy --broadcast ...
forge create src/TestUSDC.sol:TestUSDC --legacy --broadcast ...
forge create src/FixedPriceOracle.sol:FixedPriceOracle --legacy --broadcast \
  --constructor-args <initial price, 8 decimals> ...
forge create src/StreamVerifierASC.sol:StreamVerifierASC --legacy --broadcast \
  --libraries src/libs/EvmV1Decoder.sol:EvmV1Decoder:<decoder address> \
  --constructor-args <sourceChainKey> <sablierLockup address> ...
forge create src/CreditPool.sol:CreditPool --legacy --broadcast \
  --constructor-args <usdc address> <asc address> ...
cast send <asc address> "setPool(address)" <pool address> --legacy ...
cast send <pool address> "setCollateralToken(address,address,uint256,bool)" \
  <nebula token address> <oracle address> <base ltv bps> true --legacy ...
```

**Sablier's real Sepolia deployment** (v4.0 Lockup, verified 2026-08-26 against the raw
deployment broadcast in `sablier-labs/sdk`, not just docs prose):

| Contract | Address |
|---|---|
| SablierLockup | `0xe61cb9153356419bdad0a8767c059f92d221a3c4` |
| SablierBatchLockup | `0xd4ddc49f9d03a48293b5c8d89cc210af49d03d72` |
| LockupHelpers | `0xc86b56250d2758f30d09b3420d9ec5b646244c7c` |
| LockupMath | `0x6c873bce27aa6ca803ef7013f05d1802ab6995b6` |

## TODO

- [ ] Redeploy StreamVerifierASC + CreditPool under the new design, update this doc's
      address table
- [ ] Example `txKey` and a link to the on-chain `StreamEventProcessed` event for each
      event type
- [ ] Screenshot/log of a rejected replay attempt
- [ ] Screenshot/log of a rejected failed-source-tx proof (`receiptStatus == 0`)
- [ ] Screenshot/log of a rejected cancelable/transferable stream
- [ ] Batch proof example, if implemented in time
