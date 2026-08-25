# StreamCredit — Technical Spec

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
┌─ Ethereum Sepolia ─────────┐         ┌─ Creditcoin CC3 Testnet ──────────────────┐
│  SalaryStream.sol          │         │  StreamVerifierASC.sol                    │
│   ├ createStream()         │ events  │   ├ processStreamEvent(proof...)          │
│   ├ withdraw()             │────┐    │   │   ├ replay check (txKey)              │
│   └ cancel()               │    │    │   │   ├ VERIFIER.verifyAndEmit() @0x0FD2  │
└────────────────────────────┘    │    │   │   ├ receiptStatus == 1                │
                                  │    │   │   ├ decode event (EvmV1Decoder)       │
        ┌─ Worker (Node/TS) ──────▼─┐  │   │   └ route → registry / pool           │
        │ ethers v6 listeners       │  │   └ remainingLocked(user) view            │
        │ waitUntilHeightAttested   │  │  CreditPool.sol                           │
        │ ProofBuilder.getProof     │──►   ├ deposit/withdraw (LP)                 │
        │ submit tx → ASC           │  │   ├ borrow / repay                        │
        └───────────────────────────┘  │   ├ onSalaryWithdrawn → garnish           │
                                       │   └ settleGarnish                         │
                                       │  EmployerRegistry.sol (stake-gated)       │
                                       │  TestUSDC.sol (mintable tUSDC)            │
                                       └───────────────────────────────────────────┘
```

## 2.3 Contract specs

See implementation:
- [SalaryStream.sol](../contracts/source/src/SalaryStream.sol) — §2.3.1
- [StreamVerifierASC.sol](../contracts/creditcoin/src/StreamVerifierASC.sol) — §2.3.2
- [CreditPool.sol](../contracts/creditcoin/src/CreditPool.sol) — §2.3.3
- [EmployerRegistry.sol](../contracts/creditcoin/src/EmployerRegistry.sol) + [TestUSDC.sol](../contracts/creditcoin/src/TestUSDC.sol) — §2.3.4

Key parameters (CreditPool):

```solidity
uint256 public constant BASE_LTV_BPS   = 5000;  // 50%
uint256 public constant LTV_STEP_BPS   = 500;   // +5% per fully-repaid loan
uint256 public constant MAX_LTV_BPS    = 7000;  // 70% cap
uint256 public constant GARNISH_BPS    = 3000;  // 30% of each salary withdrawal
uint256 public constant INTEREST_BPS   = 500;   // flat 5% per loan (MVP; no time accrual)
```

Design notes: flat interest avoids per-block accrual complexity in a 19-day build; garnish is an *obligation ledger* (funds physically arrive only via `settleGarnish` on Creditcoin) — honest about the cross-chain enforcement gap, protected by the ≤50–70% LTV buffer against **unvested** value only.

**Vendored, not stubbed**: `contracts/creditcoin/src/libs/EvmV1Decoder.sol` and `NativeQueryVerifier.sol` are vendored verbatim from the real reference implementation — `@gluwa/usc-contracts@0.1.2` (`contracts/decoding/EvmV1Decoder.sol`) and `gluwa/attestcoin-protocol-examples` (`contracts/sol/VerifierInterface.sol`; this repo is the renamed `usc-testnet-bridge-examples`), both pinned exactly as the reference examples repo's own `package.json` pins them (verified 2026-08-25). `StreamVerifierASC.processStreamEvent`'s replay-key derivation (`_computeQueryId`) also mirrors `USCBase._computeQueryId` from that repo's `USCBase.sol` — chainKey/blockHeight/txIndex packed via assembly, txIndex sourced from the precompile's own `calculateTxIndex`, not derived client-side.

**Known scaffolding gap**: `EvmV1Decoder`'s functions are declared `public`, not `internal`, so importing it requires Solidity library linking at build/deploy time. `forge build` / `forge script` handle this automatically for locally-defined libraries, but this hasn't been exercised yet since `forge` isn't installed in this environment — verify on the first real `forge build` (Day 7–10 plan, §2.8, "hardest contract" work). `_handleCancelled` in `StreamVerifierASC.sol` is also an open TODO: `SalaryStreamCancelled` doesn't carry the recipient address in its topics/data, so cancellation routing needs either an event signature change or an extra lookup.

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

// 2. Listen to ALL three events from the single stream contract
streamContract.on('*', async (ev) => queue.push(ev.log.transactionHash));

// 3. Pipeline per tx: attest-wait → proof → submit (with persistence + retry)
async function process(txHash: string) {
  const tx = await source.getTransaction(txHash);
  await builder.waitUntilHeightAttested(sepolia.chainKey, tx!.blockNumber!); // poll 15s / timeout 15m
  const r = await builder.getProof(txHash);
  if (!r.success || !r.data) throw new Error(r.error);
  const p = r.data;
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
| Unit (contracts) | Foundry (`forge test`) | stream math, vesting, LTV/garnish accounting, replay rejection, mock-verifier ASC routing |
| Decoder integration | Foundry fork/fixtures | feed real `txBytes` captured from testnet into `_routeLogs` |
| E2E | ts script [apps/worker/src/e2e.ts](../apps/worker/src/e2e.ts) | Sepolia create → attest → prove → CC verify → borrow → withdraw → garnish → settle → LTV up |
| Demo video (≤5 min) | screen capture | the E2E script + block explorer views on both chains |

**Known timing reality**: attestation wait is minutes-scale on testnet — pre-record segments; don't run the demo fully live.

## 2.7 Monorepo structure

See root [README.md](../README.md) for the up-to-date tree; original design target:

```
streamcredit/
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
│   ├── shared/                  # @streamcredit/shared — ABIs, addresses.ts, event topics, types
│   └── config/                  # shared tsconfig / eslint presets
│
├── apps/
│   ├── worker/                  # @streamcredit/worker — the Attestcoin relay
│   └── web/                     # @streamcredit/web — minimal Next.js/Vite dApp (deferred — infra first)
│
├── docs/
└── .github/workflows/ci.yml
```

**Tooling choices (latest-standard):** pnpm workspaces + Turborepo (fast, zero-config caching) · Foundry for both contract packages (fast tests; two isolated projects because the two chains share no code) · TypeScript strict everywhere · `@streamcredit/shared` is the single source of truth for ABIs/addresses so worker & web never drift · CI runs `forge test` + typecheck. Solidity `^0.8.23` to match the reference ASC examples.

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
