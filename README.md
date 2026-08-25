# StreamCredit

Borrow against your on-chain salary stream. Employers pay via locked payment streams on
Ethereum; the [Attestcoin Protocol](https://creditcoin.org) cryptographically proves those
streams on Creditcoin; borrowers receive a bank-style credit line — no crypto
over-collateralization.

> **BUIDL CTC 2026 Fall — DeFi Track.** Full spec: [docs/product-spec.md](docs/product-spec.md)
> · [docs/technical-spec.md](docs/technical-spec.md) · required deep-dive:
> [docs/attestcoin-integration.md](docs/attestcoin-integration.md).

## Status

Deployed and wired on Sepolia + CC3 Testnet (2026-08-25). `apps/web` is still deferred.
Deployed addresses and the deploy workaround needed for CC3 Testnet are in
[docs/attestcoin-integration.md](docs/attestcoin-integration.md#deployed-addresses).

- [`contracts/creditcoin/src/libs/`](contracts/creditcoin/src/libs/) — `EvmV1Decoder.sol` and
  `NativeQueryVerifier.sol` are vendored verbatim from the real reference implementation
  (`@gluwa/usc-contracts@0.1.2`, `gluwa/attestcoin-protocol-examples`), pinned to the same
  versions that repo's own `package.json` uses, with attribution headers. Not stubs.
- [`apps/worker/src/chain.ts`](apps/worker/src/chain.ts) /
  [`proof.ts`](apps/worker/src/proof.ts) — written against and typechecked against the real
  installed `@gluwa/usc-sdk@0.18.0` package (verified 2026-08-25), not just the spec's
  description of it. The full proof pipeline (chainKey resolution, fetching a real proof,
  on-chain verification, decoding real tx bytes) was run end to end against the live
  network before any of our own contracts were deployed.
- [`apps/worker/src/e2e.ts`](apps/worker/src/e2e.ts) — demo flow skeleton with TODOs for
  each step, contracts are deployed now so this can be filled in.
- `forge script` doesn't work against CC3 Testnet (Foundry's local simulation panics on
  a missing `prevrandao` header field this chain doesn't set). Deploying there needs
  `forge create` per contract instead, see the deployment note linked above.

## Repo layout

```
streamcredit/
├── contracts/
│   ├── source/       # Foundry project — SalaryStream.sol (Ethereum Sepolia)
│   └── creditcoin/   # Foundry project — StreamVerifierASC, CreditPool, EmployerRegistry, TestUSDC (CC3 Testnet)
├── packages/
│   ├── shared/        # @streamcredit/shared — ABIs, addresses, event topics, types
│   └── config/        # shared tsconfig / eslint presets
├── apps/
│   ├── worker/         # @streamcredit/worker — the Attestcoin relay (listeners → proof → submit)
│   └── web/            # @streamcredit/web — dApp UI (deferred)
└── docs/                # product spec, technical spec, integration writeup, demo script
```

## Setup

Requires [Foundry](https://getfoundry.sh) (`curl -L https://foundry.paradigm.xyz | bash && foundryup`)
and Node 20+ / pnpm 9+.

```bash
# TS workspace
pnpm install

# Contracts — each is an independent Foundry project (no shared code between chains).
# --no-git avoids adding forge-std as a submodule of the outer repo; lib/ is gitignored,
# so run this after every fresh clone.
forge install foundry-rs/forge-std --no-git --root contracts/source
forge install foundry-rs/forge-std --no-git --root contracts/creditcoin
forge install OpenZeppelin/openzeppelin-contracts@v5.7.0 --no-git --root contracts/creditcoin
forge test --root contracts/source
forge test --root contracts/creditcoin

# Env
cp .env.example .env   # fill in RPC URLs, private keys, deployed addresses
```

Verified 2026-08-25: both projects build and their full test suites pass (40/40 on
`contracts/source`, 112/112 on `contracts/creditcoin`) against Foundry v1.7.1.

## Deploying

```bash
# 1. Sepolia
forge script contracts/source/script/Deploy.s.sol \
  --rpc-url sepolia --private-key $DEPLOYER_PRIVATE_KEY --broadcast

# 2. Resolve Sepolia's Creditcoin-internal chainKey (NOT the EVM chainId — §2.1)
#    then set STREAM_CONTRACT + SOURCE_CHAIN_KEY before the next step.

# 3. CC3 Testnet — deploys EmployerRegistry, TestUSDC, StreamVerifierASC, CreditPool
forge script contracts/creditcoin/script/Deploy.s.sol \
  --rpc-url cc3_testnet --private-key $CC3_DEPLOYER_PRIVATE_KEY --broadcast
```

`forge script` works fine on Sepolia, but panics against CC3 Testnet (Foundry's local
simulation needs a `prevrandao` header field this chain doesn't set). Use `forge create`
per contract instead for step 3 — see
[docs/attestcoin-integration.md](docs/attestcoin-integration.md#deployed-addresses) for
the exact commands and the addresses from the live run.

## Running the worker

```bash
pnpm worker        # listens for SalaryStream events, relays proofs to StreamVerifierASC
pnpm worker:e2e     # scripted demo flow — see docs/demo-script.md
```

## Trust model

State honestly, not oversold — see
[docs/product-spec.md §1.6](docs/product-spec.md#16-trust--risk-model-state-honestly-in-submission)
and [docs/attestcoin-integration.md](docs/attestcoin-integration.md).
