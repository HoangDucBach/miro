# Miro — Technical Spec

> Spec verified against Creditcoin docs as of 2026-08-25 (post-USC→Attestcoin rename).
> See [product-spec.md](./product-spec.md) for the product/trust-model half of this document.

## 2.1 Verified environment facts (latest docs)

- **SDK**: `@gluwa/usc-sdk` (name unchanged after rename), TypeScript, **ethers v6 peer dep**.
- **Proof generation**: `proofProvider.service.ProofBuilder` (hosted; recommended) or `proofProvider.raw.RawProofBuilder` (local; same interface). *(The older `ProverAPIProofGenerator` naming is obsolete.)*
- **Prover service (testnet)**: `https://prover.cc3-testnet.creditcoin.network`
- **Creditcoin RPC (testnet)**: `https://rpc.cc3-testnet.creditcoin.network`
- **Block Prover Precompile**: address **`0x0FD2`** (formerly "Native Query Verifier" — interfaces still use `INativeQueryVerifier` naming). Verified via `verify()` / `verifyAndEmit()`, synchronous, same-transaction.
- **`chainKey`** is Creditcoin-internal (Sepolia = `1` on CC3 Testnet) — **not** the EVM chainId. Resolve at runtime via `PrecompileChainInfoProvider.getSupportedChains()`.
- **Attestation wait**: `proofBuilder.waitUntilHeightAttested(chainKey, blockNumber)` — polls every 15s, 15m default timeout.
- **Batch**: `getBatchProof([...])`, max **10 tx** sharing one continuity proof, within **1000 blocks**.
- **⚠ Critical**: the precompile does **not** validate tx success. ASC **MUST** decode receipt and require `receiptStatus == 1` (`EvmV1Decoder.decodeReceiptFields`).
- Decoding: `EvmV1Decoder` — `getTransactionType`, `decodeReceiptFields`, `getLogsByEventSignature`, `decodeCommonTxFields`. Reference impl: `gluwa/usc-testnet-bridge-examples` → `USCMinter.sol`, `hello-bridge`.

## 2.2 Architecture

```
┌─ Ethereum Sepolia ─────────────────┐   ┌─ Creditcoin CC3 Testnet ───────────────────┐
│  SablierLockup (real, NOT ours)    │   │  StreamVerifierASC.sol (renamed conceptually│
│   0xe61cb9153356419bdad0a8767c...  │   │  to a Sablier-reading verifier)             │
│   ├ createWithDurationsLL()        │events│  ├ processStreamEvent(proof...)          │
│   ├ withdraw() / withdrawMax()     │──┐│   │   ├ replay check (txKey)                │
│   ├ cancel() / renounce()          │  ││   │   ├ VERIFIER.verifyAndEmit() @0x0FD2    │
│   └ isCancelable() / ownerOf()     │  ││   │   ├ receiptStatus == 1                  │
└─────────────────────────────────────┘  ││   │   ├ decode event (EvmV1Decoder)        │
        ┌─ Worker (Node/TS) ──────────▼┐ │   │   ├ reject if isCancelable == true      │
        │ ethers v6 listeners           │ │   │   └ route → pool                       │
        │ waitUntilHeightAttested       │ │   └ remainingLocked(user) view             │
        │ ProofBuilder.getProof         │─►  CreditPool.sol                            │
        │ submit tx → ASC               │ │   ├ deposit/withdraw (LP, tUSDC)           │
        └────────────────────────────────┘ │   ├ borrow / repay                        │
                                            │   ├ onTokenWithdrawn → garnish            │
                                            │   ├ settleGarnish                        │
                                            │   └ collateral token registry:           │
                                            │       mapping(token => PriceOracle, LTV) │
                                            │  TestUSDC.sol (mintable tUSDC)            │
                                            └────────────────────────────────────────────┘
```

**What changed from the original salary-stream design**: the Ethereum-side contract is no longer ours — `SalaryStream.sol` and `EmployerRegistry.sol` are dropped entirely. The worker and ASC-equivalent verifier now read a real, unmodified third-party protocol's state (Sablier's `SablierLockup`). `CreditPool` gains a collateral-token registry (multiple ERC-20s, each with its own price oracle and LTV) instead of a single hardcoded ETH/`FixedPriceOracle` pair, because the vested asset can be any whitelisted token, not always ETH.

## 2.3 Contract specs

See implementation:
- [StreamVerifierASC.sol](../contracts/creditcoin/src/StreamVerifierASC.sol) — §2.3.1, reads Sablier's real events instead of a self-written stream contract's
- [CreditPool.sol](../contracts/creditcoin/src/CreditPool.sol) — §2.3.2, now multi-token collateral
- [TestUSDC.sol](../contracts/creditcoin/src/TestUSDC.sol) — §2.3.3, unchanged debt-token mock

**Real Sablier ABI facts** (`SablierLockup`, v4.0, verified 2026-08-26 against `sablier-labs/sdk/abi/lockup/v4.0/SablierLockup.json` — deployed after this project's original knowledge cutoff, so nothing here was assumed from memory):

- One unified ERC-721 contract handles all vesting models (Linear/Dynamic/Tranched/PriceGated). Miro only cares about the Linear model.
- Creation: `createWithDurationsLL(...)` / `createWithTimestampsLL(...)` → emits `CreateLockupLinearStream(uint256 streamId, tuple, uint40, uint40, tuple)`. **Exact struct field names still need confirming from the full ABI/docs before writing the decoder** — only parameter *types* were extracted so far, not field names.
- Withdraw: `withdraw(streamId, to, amount)` → emits `WithdrawFromLockupStream(uint256, address, address, uint128)`.
- Cancel: `cancel(streamId)` → emits `CancelLockupStream(uint256, address, address, address, uint128, uint128)`.
- **`renounce(streamId)`**: makes a cancelable stream permanently non-cancelable. One-directional — a stream can never go from non-cancelable back to cancelable. This is why checking `isCancelable(streamId) == false` once, at borrow time, is a permanent guarantee and not just a point-in-time snapshot.
- View functions Miro depends on: `isCancelable(streamId)`, `isCold(streamId)` (stream has ended, one way or another), `isDepleted`, `wasCanceled`, `ownerOf(streamId)` (current NFT holder — the actual borrower identity, which can change via ERC-721 transfer, see product-spec.md §1.6), `withdrawableAmountOf(streamId)`, `streamedAmountOf(streamId)`, `refundableAmountOf(streamId)`.

**Sepolia deployment addresses** (Sablier Lockup v4.0, verified against the raw deployment broadcast in `sablier-labs/sdk`, not just docs prose):

| Contract | Address |
|---|---|
| SablierLockup | `0xe61cb9153356419bdad0a8767c059f92d221a3c4` |
| SablierBatchLockup | `0xd4ddc49f9d03a48293b5c8d89cc210af49d03d72` |
| LockupHelpers | `0xc86b56250d2758f30d09b3420d9ec5b646244c7c` |
| LockupMath | `0x6c873bce27aa6ca803ef7013f05d1802ab6995b6` |

Key parameters (CreditPool, unchanged from the original design):

```solidity
uint256 public constant BASE_LTV_BPS   = 5000;  // 50%, per collateral token this may be set lower
uint256 public constant LTV_STEP_BPS   = 500;   // +5% per fully-repaid loan
uint256 public constant MAX_LTV_BPS    = 7000;  // 70% cap
uint256 public constant GARNISH_BPS    = 3000;  // 30% of each withdrawal
uint256 public constant INTEREST_BPS   = 500;   // flat 5% per loan (MVP; no time accrual)
```

New surface needed in CreditPool: a per-token config (`priceOracle`, `enabled`, optionally a per-token LTV override) instead of the single immutable `priceOracle`/`debtDecimals` pair from the salary-stream design — see product-spec.md §1.6 for why a single fixed-price ETH oracle no longer fits once collateral can be any whitelisted ERC-20.

**Vendored, not stubbed**: `contracts/creditcoin/src/libs/EvmV1Decoder.sol` and `NativeQueryVerifier.sol` remain vendored verbatim from the real reference implementation — `@gluwa/usc-contracts@0.1.2` and `gluwa/attestcoin-protocol-examples` — unaffected by this pivot, since the proof-verification layer doesn't care what the source-chain contract is.

**Retired from the original design**: `SalaryStream.sol`, `EmployerRegistry.sol`, and the old `_handleCancelled` TODO (it doesn't carry a recipient) are all dropped — Sablier's `CancelLockupStream` event already carries both `sender` and `recipient` as topics, so the routing problem that blocked cancellation-handling in the original design doesn't exist here.

## 2.4 Off-chain worker (TypeScript, ethers v6, latest SDK API)

Implementation: [apps/worker/src](../apps/worker/src)

```typescript
import { JsonRpcProvider, Wallet, Contract } from 'ethers';
import { chainInfo, blockProver, proofProvider } from '@gluwa/usc-sdk';

const source = new JsonRpcProvider(process.env.SEPOLIA_RPC);
const cc     = new JsonRpcProvider('https://rpc.cc3-testnet.creditcoin.network');

// 1. Resolve chainKey at runtime — never hardcode blindly
const info = new chainInfo.PrecompileChainInfoProvider(cc);
const chains = await info.getSupportedChains();
const sepolia = chains.find(c => c.chainId === 11155111n)!; // → chainKey

const builder = new proofProvider.service.ProofBuilder(
  sepolia.chainKey, 'https://prover.cc3-testnet.creditcoin.network');

// 2. Listen to Sablier's real SablierLockup contract, not a contract we own.
//    Relevant events: CreateLockupLinearStream / WithdrawFromLockupStream / CancelLockupStream.
sablierLockup.on('*', async (ev) => queue.push(ev.log.transactionHash));

// 3. Pipeline per tx: attest-wait → proof → submit (with persistence + retry)
async function process(txHash: string) {
  const tx = await source.getTransaction(txHash);
  await builder.waitUntilHeightAttested(sepolia.chainKey, tx!.blockNumber!); // poll 15s / timeout 15m
  const r = await builder.getProof(txHash);
  if (!r.success || !r.data) throw new Error(r.error);
  const p = r.data;
  // On a CreateLockupLinearStream event specifically: fetch isCancelable(streamId) from
  // sablierLockup directly (a plain read, not part of the proof) and skip submission
  // entirely if it's true — a cancelable stream is never accepted as collateral.
  await asc.processStreamEvent(
    p.chainKey, p.headerNumber, p.txBytes,
    p.merkleProof.root, p.merkleProof.siblings,
    p.continuityProof.lowerEndpointDigest, p.continuityProof.roots);
}
// Stretch: batch mode — getBatchProof (≤10 tx, ≤1000-block span, shared continuity proof)
// Fallback: swap ProofBuilder → RawProofBuilder (same ProofProvider interface) if API is down.
```

State: a tiny JSON/SQLite queue (`pending → attested → proven → submitted`) so restarts don't drop events; idempotent because ASC rejects replays anyway.

**Verified against the real package** (`@gluwa/usc-sdk@0.18.0`, downloaded and inspected 2026-08-25 — not just this doc's description): `chainInfo.PrecompileChainInfoProvider.getSupportedChains()` / `.waitUntilHeightAttested()`, `proofProvider.service.ProofBuilder` (`getProof`, `getBatchProof`, `waitUntilHeightAttested`), and `proofProvider.raw.RawProofBuilder`. One correction to the spec's original description: `waitUntilHeightAttested` lives on `ChainInfoProvider`, not on every `ProofProvider` — `RawProofBuilder` (the offline fallback) does **not** implement it, only `getProof`/`getBatchProof`. [chain.ts](../apps/worker/src/chain.ts) exports a shared `ChainInfoProvider` instance for exactly this reason; [index.ts](../apps/worker/src/index.ts) calls `waitUntilHeightAttested` on that instance rather than on the proof builder, so the drain loop stays correct regardless of which builder is active. The reference examples repo (`gluwa/attestcoin-protocol-examples`) pins `@gluwa/usc-sdk@0.18.0`, `@gluwa/usc-contracts@0.1.2`, `ethers@^6.17.0` — this repo matches those pins.

## 2.5 Config & env

See [.env.example](../.env.example) at repo root.

## 2.6 Testing & demo plan

| Layer | Tool | Coverage |
|---|---|---|
| Unit (contracts) | Foundry (`forge test`) | LTV/garnish accounting per collateral token, replay rejection, cancelable-stream rejection, mock-verifier ASC routing |
| Decoder integration | Foundry fork/fixtures | feed real `txBytes` captured from a real Sepolia `SablierLockup` tx into `_routeLogs` |
| E2E | ts script [apps/worker/src/e2e.ts](../apps/worker/src/e2e.ts) | mint demo NEBULA token → `SablierLockup.createWithDurationsLL` → attest → prove → CC verify → borrow → `SablierLockup.withdraw` → garnish → settle → LTV up |
| Demo video (≤5 min) | screen capture | the E2E script + Sepolia explorer view of the real `SablierLockup` contract + CC3 explorer |

**Known timing reality**: attestation wait is minutes-scale on testnet — pre-record segments; don't run the demo fully live. Vesting duration for the demo stream should be short (15–30 min), matched to the fact that the worker still needs real attestation+proof time (1–3 min) per relay round, so the two timelines don't visibly desync on camera.

## 2.7 Monorepo structure

See root [README.md](../README.md) for the up-to-date tree; original design target:

```
miro/
├── package.json                 # pnpm workspaces + turborepo pipeline
├── pnpm-workspace.yaml          # packages: apps/*, packages/*, contracts/*
├── turbo.json                   # build/test/lint task graph
├── .env.example
├── README.md                    # quickstart + Attestcoin Integration Summary (submission!)
│
├── contracts/
│   ├── source/                  # ── Sepolia (Foundry project)
│   └── creditcoin/              # ── CC3 Testnet (Foundry project)
│
├── packages/
│   ├── shared/                  # @miro/shared — ABIs, addresses.ts, event topics, types
│   └── config/                  # shared tsconfig / eslint presets
│
├── apps/
│   ├── worker/                  # @miro/worker — the Attestcoin relay
│   └── web/                     # @miro/web — minimal Next.js/Vite dApp (deferred — infra first)
│
├── docs/
└── .github/workflows/ci.yml
```

**Tooling choices (latest-standard):** pnpm workspaces + Turborepo (fast, zero-config caching) · Foundry for both contract packages (fast tests; two isolated projects because the two chains share no code) · TypeScript strict everywhere · `@miro/shared` is the single source of truth for ABIs/addresses so worker & web never drift · CI runs `forge test` + typecheck. Solidity `^0.8.23` to match the reference ASC examples.

## 2.8 19-day plan (2 devs)

| Days | Dev A (Solidity) | Dev B (TS/infra) |
|---|---|---|
| 1–2 | Repo scaffold, `SalaryStream` + tests | Workspace setup, SDK spike: prove ONE manual Sepolia tx end-to-end **(de-risk first!)** |
| 3–6 | `EmployerRegistry`, `TestUSDC`, `CreditPool` + tests | Worker pipeline: listeners → queue → attest-wait → proof → submit |
| 7–10 | `StreamVerifierASC` + decoder integration (hardest contract) | Wire worker↔ASC on CC3 testnet; capture real txBytes fixtures for Dev A |
| 11–13 | Full-flow contract fixes from E2E findings | `e2e.ts` demo script; minimal web UI |
| 14–16 | Deploy final, verify, seed LP liquidity | E2E hardening, video rehearsal |
| 17–18 | `attestcoin-integration.md`, README, deck | Record & edit demo video |
| 19 | **Submit (1 day before the Sep 13 deadline)** | Buffer |

> Ordering rationale: the SDK spike on day 1–2 is the highest-risk unknown (attestation latency, proof format) — prove it before writing a line of pool logic.

## 2.9 Migration to the token-vesting design (post day-16 pivot)

The 19-day plan above describes the original salary-stream design; the project reached "deployed + worker complete + Dockerized" against that design before pivoting to token vesting for a stronger match with Attestcoin/Creditcoin's actual thesis (see product-spec.md §1.1–§1.3). Remaining work under the new design:

- [x] Drop `contracts/source/src/SalaryStream.sol`; replaced with `NebulaToken.sol`, a mintable demo ERC-20 for a controllable demo price/supply.
- [x] Drop `EmployerRegistry.sol`; no registry/staking actor exists in the new design.
- [x] Rewrite `StreamVerifierASC.sol`'s event decoding to match `CreateLockupLinearStream` / `WithdrawFromLockupStream` (field names confirmed from the full ABI, see §2.3). `CancelLockupStream` is intentionally never routed — structurally unreachable now that only non-cancelable streams are accepted.
- [x] Add a collateral-token registry to `CreditPool.sol`: `mapping(address => CollateralConfig)` holding `priceOracle`, `tokenDecimals`, `baseLtvBps`, `enabled`, replacing the single immutable ETH/`FixedPriceOracle` pair. Admin-only `setCollateralToken(...)`.
- [x] Enforce `!cancelable && !transferable` as a hard on-chain requirement in `StreamVerifierASC._handleCreated` (decoded directly from the event's own data, reverts the whole `processStreamEvent` call if violated) — not just a worker-side pre-filter.
- [x] Rewrite `apps/worker/src/e2e.ts` end to end against `SablierLockup` on Sepolia instead of `SalaryStream.sol`; also rewrote `packages/shared` ABIs/types/addresses and `apps/worker/src/index.ts`'s listener target.
- [x] 114/114 Foundry tests passing (5 `contracts/source`, 109 `contracts/creditcoin`), 25/25 worker tests passing, after the full rewrite.
- [ ] Redeploy `CreditPool` + verifier to CC3 Testnet; update `.env` and `docs/attestcoin-integration.md` with the real addresses (currently still shows the prior design's deployment, explicitly marked stale).
- [ ] `apps/web` remains deferred, unaffected by this pivot either way.
