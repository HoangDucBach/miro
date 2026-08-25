# Attestcoin Integration Summary

> **Required by the hackathon submission** (§1.8). This is the deep-dive on *how* and *why*
> StreamCredit uses the Attestcoin Protocol, and an honest accounting of what it does and
> does not guarantee. Status: scaffold — fill in the TODO sections once the contracts are
> deployed to testnet and the worker has processed real events.

## What we prove, and why

StreamCredit needs to answer one question trustlessly: *is this borrower's salary stream
real, and how much of it remains locked?* That requires proving three lifecycle events
emitted by [`SalaryStream.sol`](../contracts/source/src/SalaryStream.sol) on Ethereum
Sepolia, on Creditcoin, without a trusted oracle operator:

| Event | Why we prove it |
|---|---|
| `SalaryStreamCreated` | Establishes the collateral base (`deposit`, `ratePerSecond`, vesting window) and which `EmployerRegistry`-staked employer backs it |
| `SalaryStreamWithdrawn` | Triggers the wage-garnishment obligation (`CreditPool.onSalaryWithdrawn`) |
| `SalaryStreamCancelled` | Freezes borrowing immediately (`CreditPool.onStreamCancelled`) |

## How verification works

1. The worker ([apps/worker/src/index.ts](../apps/worker/src/index.ts)) detects a
   `SalaryStream` event and enqueues it in a persistent job store.
2. It waits for the source block to be attested (`waitUntilHeightAttested`), then requests
   a Merkle + continuity proof from the Prover service
   ([apps/worker/src/proof.ts](../apps/worker/src/proof.ts)).
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
     `withdraw()` call and have it treated as a real salary withdrawal.
   - filters logs to only those emitted by our known `SOURCE_STREAM_CONTRACT`, so a proof
     of an unrelated contract's event can't be routed into `StreamRecord` state.

## Depth of utilization

- **3 distinct event types** proven and routed to different business logic (registry-gated
  creation, garnishment, freeze).
- **Receipt-status validation** enforced at the ASC level, not left to convention.
- **Replay protection** via `(chainKey, blockHeight, txIndex)`-keyed `processedQueries`.
- **Batch proofs** (stretch, §2.1): `getBatchProof` support wired into
  [proof.ts](../apps/worker/src/proof.ts) for up to 10 tx sharing one continuity proof.
- **Split-contract architecture**: `StreamVerifierASC` only verifies and records facts;
  `CreditPool` holds all money logic — keeps the audit surface of the proof-handling code
  small.

## Trust model — stated honestly

See [product-spec.md §1.6](./product-spec.md#16-trust--risk-model-state-honestly-in-submission)
for the full table. The two gaps worth being explicit about in a demo/judging context:

1. **Cross-chain enforcement gap**: a loan lives on Creditcoin, salary lives on Ethereum.
   StreamCredit cannot seize Ethereum funds to enforce garnishment — `pendingGarnish` is an
   obligation ledger, and funds only move when the borrower calls `settleGarnish` on
   Creditcoin. The 50–70% LTV cap against *unvested* value is the actual lender protection,
   not the garnishment mechanism itself.
2. **Employer identity is a stake, not KYC**: `EmployerRegistry` requires 100 tCTC staked,
   which is an MVP sybil-resistance proxy, not identity verification. Roadmap item:
   attestation-based employer identity + slashing.

## Deployed addresses

**Sepolia:**

| Contract | Address |
|---|---|
| SalaryStream | [`0xEEe9f75C93ac2D4B568Ff884A4b08D1a55345b7F`](https://sepolia.etherscan.io/address/0xEEe9f75C93ac2D4B568Ff884A4b08D1a55345b7F) |

**CC3 Testnet:**

| Contract | Address |
|---|---|
| EmployerRegistry | `0x7767A97fC07906EB87CA3cA158DC6D2FdC47e511` |
| TestUSDC | `0xc2706681eC25d9823882A7f80040579501d9bc16` |
| EvmV1Decoder (library) | `0x821EA1E92283fDDAde6E4F192370Dc2F9f5a83e2` |
| StreamVerifierASC | `0x5214F820D7971267d89E2119a1D6c2a90fe7C441` |
| CreditPool | `0x5620f9286d1F8D29ce99cFA8eDE4Eaab20B204E1` |

No CC3 Testnet explorer link included here, none confirmed yet. `asc.pool()` was checked
on-chain and matches the CreditPool address above, so the wiring is confirmed correct.

**Deployment note**: `forge script Deploy.s.sol` panics against CC3 Testnet
(`prevrandao not set`) — Foundry's local simulation step expects a post-merge Ethereum
block header field that CC3's blocks don't carry. Worked around by deploying each
contract individually with `forge create` (which skips that simulation step) and wiring
them together afterward with `cast send`, in place of the single `Deploy.s.sol` run:

```bash
forge create src/libs/EvmV1Decoder.sol:EvmV1Decoder --legacy --broadcast ...
forge create src/EmployerRegistry.sol:EmployerRegistry --legacy --broadcast ...
forge create src/TestUSDC.sol:TestUSDC --legacy --broadcast ...
forge create src/StreamVerifierASC.sol:StreamVerifierASC --legacy --broadcast \
  --libraries src/libs/EvmV1Decoder.sol:EvmV1Decoder:<decoder address> \
  --constructor-args <registry> <sourceChainKey> <streamContract> ...
forge create src/CreditPool.sol:CreditPool --legacy --broadcast \
  --constructor-args <usdc address> <asc address> ...
cast send <asc address> "setPool(address)" <pool address> --legacy ...
```

## TODO

- [ ] Example `txKey` and a link to the on-chain `StreamEventProcessed` event for each of
      the 3 event types
- [ ] Screenshot/log of a rejected replay attempt
- [ ] Screenshot/log of a rejected failed-source-tx proof (`receiptStatus == 0`)
- [ ] Batch proof example, if implemented in time
