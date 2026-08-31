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
- **⚠ Critical**: the precompile does **not** validate tx success. The passport contract **MUST** decode receipt and require `receiptStatus == 1` (`EvmV1Decoder.decodeReceiptFields`).
- Decoding: `EvmV1Decoder` — `getTransactionType`, `decodeReceiptFields`, `getLogsByEventSignature`, `decodeCommonTxFields`. Reference impl: `gluwa/usc-testnet-bridge-examples` → `USCMinter.sol`, `hello-bridge`.
- **Supported source chains on the public CC3 Testnet today**: only Sepolia (`chainKey 1`), verified 2026-08-27 against `gluwa/creditcoin-usc-networks/networks.json` (the real network config repo, not docs prose). A separate internal `usc-devnet` environment additionally lists `bsc-testnet`, but that's a different RPC/attestor set, not the public testnet this project targets. See §2.10 for why the contract design doesn't hardcode this limitation.

## 2.2 Architecture

```
Sepolia                                       Creditcoin CC3 Testnet
┌──────────────────────────┐                  ┌─────────────────────────────────────┐
│ Aave V3 Pool (real)      │  Repay events     │ CreditPassport.sol                   │
│  0x6Ae43d327...           │──────┐           │  ├ processAttestation(proof...)      │
│ Morpho Blue (real)        │      │           │  │  ├ replay check (txKey)           │
│  0xd011ee229...           │      │           │  │  ├ verifyAndEmit() @0x0FD2        │
└──────────────────────────┘      │           │  │  ├ receiptStatus == 1             │
        ┌─ Worker (BullMQ) ───────▼─┐          │  │  └ route log → SourceConfig       │
        │ watch N (address,topic0)   │─────────►  ├ setSource(...) onlyOwner          │
        │ attest-wait → proof → submit│         │  ├ recordLocalRepay() onlyReporter  │
        └────────────────────────────┘          │  └ scoreOf(borrower) view           │
                                                 │ PassportPool.sol (reference lender) │
                                                 │  ├ depositCollateral() native tCTC  │
                                                 │  ├ borrow: LTV = 50% + f(score) ≤75%│
                                                 │  ├ full repay → recordLocalRepay    │
                                                 │  └ LP deposit/withdraw (tUSDC)      │
                                                 │ TestUSDC.sol, FixedPriceOracle.sol  │
                                                 └─────────────────────────────────────┘
```

Aave and Morpho are real, unmodified protocols Miro never deploys or controls. `CreditPassport` never hardcodes which chain or which protocol it reads from — every source is a `SourceConfig` entry the owner registers, so adding a third protocol (on Sepolia today, on any other chain the moment Creditcoin supports it as a source) is a config call, not a redeploy.

## 2.3 Contract specs

See implementation:
- [CreditPassport.sol](../contracts/creditcoin/src/CreditPassport.sol) — §2.3.1, the portable credit record
- [PassportPool.sol](../contracts/creditcoin/src/PassportPool.sol) — §2.3.2, reference lender that both reads and feeds the passport
- [TestUSDC.sol](../contracts/creditcoin/src/TestUSDC.sol), [FixedPriceOracle.sol](../contracts/creditcoin/src/FixedPriceOracle.sol) — unchanged debt-token mock and CTC/USD price feed

### 2.3.1 CreditPassport — source registry and scoring

```solidity
enum BorrowerLoc { Topic1, Topic2, Topic3, DataWord }
struct SourceConfig {
    uint64 chainKey;      // never hardcoded -- any chain the precompile supports
    address emitter;      // the lending protocol contract on that chain
    bytes32 topic0;       // event signature hash
    BorrowerLoc borrowerLoc;
    uint8 borrowerDataWord;
    uint8 amountDataWord;
    uint256 minAmount;    // anti-dust floor, in the event's own asset units
    bool negative;        // liquidation-style events subtract score
    bool enabled;
}
```

`sourceIdFor(chainKey, emitter, topic0)` derives a stable id; `processAttestation(...)` looks up the id per log and decodes borrower/amount from whichever topic or data word the config points at. This is what makes sources injectable: **any standard (non-anonymous) event can be described this way**, regardless of which fields happen to be indexed.

Scoring (`scoreOf`, all inputs O(1) at write time):

```solidity
uint32 constant PER_SOURCE_CAP = 10;         // diminishing returns per source
uint256 constant REPAY_POINTS = 10;
uint256 constant DIVERSITY_POINTS = 20;      // per distinct source beyond the first
uint256 constant AGE_PERIOD = 30 days;
uint256 constant AGE_POINTS_PER_PERIOD = 5;  // capped at 6 periods (+30 total)
uint256 constant NEGATIVE_PENALTY = 50;      // per negative-source event, floored at 0
```

`recordLocalRepay(borrower, amount)` lets a same-chain protocol (like `PassportPool`) report directly, no proof needed — gated by `localReporters[msg.sender]`, admin-registered. It's treated as its own distinct source (`localSourceIdFor(reporter)`) for diversity purposes.

### 2.3.2 Real event shapes (verified 2026-08-27, not assumed from memory)

Both events were verified directly against each protocol's own source, since **both have more indexed fields than a first-glance assumption would suggest** — getting this wrong would silently mis-attribute every repayment to the wrong address:

| Protocol | Event | Borrower field | Verified against |
|---|---|---|---|
| Aave V3 | `Repay(address indexed reserve, address indexed user, address indexed repayer, uint256 amount, bool useATokens)` | `user` — **topic 2** (all three addresses are indexed) | `aave-dao/aave-v3-origin`'s `IPool.sol` |
| Morpho Blue | `Repay(Id indexed id, address indexed caller, address indexed onBehalf, uint256 assets, uint256 shares)` | `onBehalf` — **topic 3** (id, caller, AND onBehalf are all indexed) | `morpho-org/morpho-blue`'s `EventsLib.sol` |

Both `amount`/`assets` land at **data word 0** in their respective events, since everything else is indexed. `CreditPassport.t.sol` builds both event shapes by hand to prove the generic decoder handles either layout correctly.

### 2.3.3 Real Sepolia deployment addresses

| Contract | Address | Source |
|---|---|---|
| Aave V3 Pool | `0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951` | `bgd-labs/aave-address-book` |
| Aave V3 Faucet | `0xC959483DBa39aa9E78757139af0e9a2EDEb3f42D` | same |
| Aave V3 DAI (reserve asset) | `0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357` | same |
| Morpho Blue | `0xd011ee229e7459ba1ddd22631ef7bf528d424a14` | `morpho-org/morpho-blue-deployment` broadcast, chain `11155111` |
| Morpho AdaptiveCurveIRM | `0x8c5ddcd3f601c91d1bf51c8ec26066010acaba7c` | same broadcast run — re-verify at deploy time, not hardcoded in contracts |

### 2.3.4 PassportPool — reference lender

```solidity
uint256 public constant BASE_LTV_BPS = 5000;       // 50%, zero passport history
uint256 public constant MAX_LTV_BPS = 7500;        // 75% cap -- always over-collateralized
uint256 public constant SCORE_LTV_CAP = 250;        // score points that saturate the bonus
uint256 public constant SCORE_BPS_PER_POINT = 10;   // +0.1% LTV per point, up to +25%
uint256 public constant INTEREST_BPS = 500;         // flat 5% per loan
uint256 public constant MIN_CREDIT_LOAN = 10e6;     // min cumulative principal before reporting
```

Collateral is native tCTC (`depositCollateral()`/`withdrawCollateral()`, health-checked). `maxLtvBps(borrower)` reads `passport.scoreOf(borrower)` live — no caching, no staleness. On a full repayment where accumulated principal since the last report crosses `MIN_CREDIT_LOAN`, the pool calls `passport.recordLocalRepay(...)` on itself as a registered local reporter — the same contract that just granted a better rate also feeds the signal that earns an even better one next time.

**Vendored, not stubbed**: `contracts/creditcoin/src/libs/EvmV1Decoder.sol` and `NativeQueryVerifier.sol` remain vendored verbatim from the real reference implementation — `@gluwa/usc-contracts@0.1.2` and `gluwa/attestcoin-protocol-examples` — unaffected by any of this project's pivots, since the proof-verification layer doesn't care what the source-chain contract is.

## 2.4 Off-chain worker (TypeScript, ethers v6, latest SDK API)

Implementation: [apps/worker/src](../apps/worker/src)

```typescript
import { JsonRpcProvider, Contract } from 'ethers';
import { chainInfo, proofProvider } from '@gluwa/usc-sdk';
import { EVENT_TOPICS } from '@miro/shared';

const source = new JsonRpcProvider(process.env.SEPOLIA_RPC);
const cc     = new JsonRpcProvider('https://rpc.cc3-testnet.creditcoin.network');

// 1. Resolve chainKey at runtime — never hardcode blindly
const info = new chainInfo.PrecompileChainInfoProvider(cc);
const chains = await info.getSupportedChains();
const sepolia = chains.find(c => c.chainId === 11155111n)!; // → chainKey

const builder = new proofProvider.service.ProofBuilder(
  sepolia.chainKey, 'https://prover.cc3-testnet.creditcoin.network');

// 2. Watch each registered source independently -- a real protocol we don't control,
//    filtered to just its Repay event topic. Adding a third source later is another
//    entry here plus a matching CreditPassport.setSource(...) call, nothing else changes.
source.on({ address: AAVE_POOL, topics: [EVENT_TOPICS.AaveRepay] }, (log) => queue.push(log));
source.on({ address: MORPHO, topics: [EVENT_TOPICS.MorphoRepay] }, (log) => queue.push(log));

// 3. Pipeline per tx: attest-wait → proof → submit (BullMQ handles retry/persistence)
async function process(txHash: string, blockNumber: number) {
  await builder.waitUntilHeightAttested(sepolia.chainKey, blockNumber); // poll 15s / timeout 15m
  const r = await builder.getProof(txHash);
  if (!r.success || !r.data) throw new Error(r.error);
  const p = r.data;
  await passport.processAttestation(
    p.chainKey, p.headerNumber, p.txBytes,
    p.merkleProof.root, p.merkleProof.siblings,
    p.continuityProof.lowerEndpointDigest, p.continuityProof.roots);
}
// Stretch: batch mode — getBatchProof (≤10 tx, ≤1000-block span, shared continuity proof)
// Fallback: swap ProofBuilder → RawProofBuilder (same ProofProvider interface) if API is down.
```

State: BullMQ + Redis queue (`apps/worker/src/lib/queue.ts`), `jobId` = txHash for dedup, exponential backoff retry; idempotent regardless because the passport rejects replays anyway.

**Verified against the real package** (`@gluwa/usc-sdk@0.18.0`): `chainInfo.PrecompileChainInfoProvider.getSupportedChains()` / `.waitUntilHeightAttested()`, `proofProvider.service.ProofBuilder` (`getProof`, `getBatchProof`, `waitUntilHeightAttested`), and `proofProvider.raw.RawProofBuilder`. `waitUntilHeightAttested` lives on `ChainInfoProvider`, not on every `ProofProvider` — `RawProofBuilder` does **not** implement it, only `getProof`/`getBatchProof`. [chain.ts](../apps/worker/src/lib/chain.ts) exports a shared `ChainInfoProvider` instance for exactly this reason.

## 2.5 Config & env

See [.env.example](../.env.example) at repo root.

## 2.6 Testing & demo plan

| Layer | Tool | Coverage |
|---|---|---|
| Unit (contracts) | Foundry (`forge test`) | source registry CRUD, config-driven decoding against both Aave- and Morpho-shaped logs, per-source cap, diversity/age scoring, negative events, replay rejection, PassportPool LTV/over-collateral invariants, local-report feedback loop |
| E2E | ts script [apps/worker/src/e2e.ts](../apps/worker/src/e2e.ts) | real Aave faucet+supply+borrow+repay → attest → prove → CC verify → score check → real Morpho market bootstrap+borrow+repay → attest → verify → diversity check → PassportPool local borrow/repay loop → final score |
| Demo video (≤5 min) | screen capture | the E2E script + Sepolia explorer view of both real protocols + CC3 explorer showing the score ticking up |

**Known timing reality**: attestation wait is minutes-scale on testnet — pre-record segments; don't run the demo fully live.

## 2.7 Monorepo structure

See root [README.md](../README.md) for the up-to-date tree.

## 2.8 19-day plan (2 devs) — original salary-stream design, historical

| Days | Dev A (Solidity) | Dev B (TS/infra) |
|---|---|---|
| 1–2 | Repo scaffold, `SalaryStream` + tests | Workspace setup, SDK spike: prove ONE manual Sepolia tx end-to-end **(de-risk first!)** |
| 3–6 | `EmployerRegistry`, `TestUSDC`, `CreditPool` + tests | Worker pipeline: listeners → queue → attest-wait → proof → submit |
| 7–10 | `StreamVerifierASC` + decoder integration (hardest contract) | Wire worker↔ASC on CC3 testnet; capture real txBytes fixtures for Dev A |
| 11–13 | Full-flow contract fixes from E2E findings | `e2e.ts` demo script; minimal web UI |
| 14–16 | Deploy final, verify, seed LP liquidity | E2E hardening, video rehearsal |
| 17–18 | `attestcoin-integration.md`, README, deck | Record & edit demo video |
| 19 | **Submit (1 day before the Sep 13 deadline)** | Buffer |

> Ordering rationale: the SDK spike on day 1–2 is the highest-risk unknown (attestation latency, proof format) — prove it before writing a line of pool logic. Superseded by two later pivots (§2.9, §2.10); kept here as a historical record of the original plan.

## 2.9 Migration to the token-vesting design — historical, itself superseded by §2.10

The project pivoted once from the original salary-stream design to token-vesting collateral (Sablier), reasoning it was a stronger match for Attestcoin's actual thesis. That design was fully built and tested (114 Foundry tests, 25 worker tests) but never redeployed before a second, sharper realization: vesting-collateral still requires full collateralization, just from more asset types — it doesn't touch the real problem (DeFi requiring over-collateralization at all). See §2.10 for the design that replaced it, and product-spec.md §1.1–§1.3 for the reasoning.

## 2.10 Migration to the cross-chain credit passport (current design)

The idea that survives *only* because of Creditcoin/Attestcoin — not just "better with it" — is aggregating trustless proof of repayment behavior from multiple unrelated chains/protocols into one portable score, usable by a lender native to none of them. Collateral-based designs (salary-stream, vesting) are strictly reproducible without Creditcoin (same-chain composability beats cross-chain for pure collateral checks); a shared, oracle-free, cross-protocol reputation record is not. See product-spec.md §1.1–§1.3.

Completed:

- [x] Dropped `StreamVerifierASC.sol`, `CreditPool.sol`, `SalaryStream.sol`/`NebulaToken.sol`, and their interfaces/tests entirely.
- [x] `CreditPassport.sol`: config-driven `SourceConfig` registry (§2.3.1), replay protection, receipt-status check — the proof-verification skeleton carried over unchanged from the prior design's `StreamVerifierASC`.
- [x] `PassportPool.sol`: native-tCTC collateral, passport-modulated LTV capped at 75%, local-reporter feedback loop (§2.3.4).
- [x] `contracts/source`: `DemoToken.sol` + `FixedMorphoOracle.sol` to bootstrap a demo Morpho market (Aave needs no deploys — it uses Aave's own real testnet reserves).
- [x] Two real lending protocols verified and wired: Aave V3 and Morpho Blue on Sepolia, both event shapes verified directly against upstream source (§2.3.2) rather than assumed.
- [x] `packages/shared`, `apps/worker/src/index.ts` (multi-source watch list), `submitter.ts` (`passportContract`/`processAttestation`), and `e2e.ts` rewritten end to end.
- [x] 126 tests passing: 86 `contracts/creditcoin`, 12 `contracts/source`, 28 `apps/worker` (vitest).
- [x] Deployed to CC3 Testnet + Sepolia (demo assets), `.env` and `docs/attestcoin-integration.md` updated with real addresses.
- [x] Live `e2e.ts` run against real infra, twice, identical results both times: real Aave V3 repay (LINK, not DAI/USDC/USDT -- all three sit above their 2B supply cap from public testnet usage, a real live-verified finding) and real Morpho Blue repay each attested and verified on-chain, `scoreOf` progressing 0 → 10 → 40 → 70 exactly per the scoring formula. Two real bugs found only by running live (missing `localReporters` ABI getter, Morpho over-repayment causing a shares underflow) and one transient-RPC issue (mitigated with 2-confirmation waits) -- see attestcoin-integration.md's live-run section for details.
- [x] `apps/web` scaffolded (2026-08-28): Next.js 16 App Router, wagmi v2 + viem, typed
      hooks generated from `@miro/shared`'s ABIs via `@wagmi/cli`, React Hook Form + Zod
      forms, dashboard (`scoreOf`) + `/pool` (PassportPool actions). No RainbowKit --
      its default wallet list statically pulls in a connector whose dependency chain
      doesn't resolve under Next 16 + Turbopack SSR; a small hand-rolled connect button on
      wagmi's own hooks replaces it. See `apps/web/README.md`.
