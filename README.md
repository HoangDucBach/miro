# Miro

A cross-chain credit passport. Real repayments on real lending protocols — Aave V3 and
Morpho Blue on Ethereum Sepolia, in this build — get attested onto Creditcoin via the
[Attestcoin Protocol](https://creditcoin.org): no bridge, no oracle operator, just a
cryptographic proof of what actually happened. The result is one portable score any
lender can read. Our own reference pool reads it to grant a better rate, and reports back
into the same passport it reads from — credit built anywhere is usable there, and credit
built there is usable anywhere else that reads it.

> **BUIDL CTC 2026 Fall — DeFi Track.** Full spec: [docs/product-spec.md](docs/product-spec.md)
> · [docs/technical-spec.md](docs/technical-spec.md) · required deep-dive:
> [docs/attestcoin-integration.md](docs/attestcoin-integration.md).

## Status

Second pivot: from collateral-based designs (salary streams, then token vesting) to a
cross-chain credit passport — the one idea that genuinely can't be reproduced without
Creditcoin (see
[technical-spec.md §2.10](docs/technical-spec.md#210-migration-to-the-cross-chain-credit-passport-current-design)).
Contracts and worker are rewritten and fully tested locally (126 tests total: 86
`contracts/creditcoin`, 12 `contracts/source`, 28 `apps/worker`); **not yet redeployed** —
the addresses in
[docs/attestcoin-integration.md](docs/attestcoin-integration.md#deployed-addresses) are
from a prior design and need refreshing. `apps/web` is still deferred.

- [`contracts/creditcoin/src/libs/`](contracts/creditcoin/src/libs/) — `EvmV1Decoder.sol` and
  `NativeQueryVerifier.sol` are vendored verbatim from the real reference implementation
  (`@gluwa/usc-contracts@0.1.2`, `gluwa/attestcoin-protocol-examples`), pinned to the same
  versions that repo's own `package.json` uses, with attribution headers. Not stubs.
- [`apps/worker/src/lib/chain.ts`](apps/worker/src/lib/chain.ts) /
  [`proof.ts`](apps/worker/src/lib/proof.ts) — written against and typechecked against the
  real installed `@gluwa/usc-sdk@0.18.0` package. The full proof pipeline was run end to
  end against the live network before any of our own contracts were deployed.
- `CreditPassport.sol` decodes real `Repay` events from Aave V3 and Morpho Blue on Sepolia
  through one config-driven mechanism (`SourceConfig`) — both events turned out to have
  more indexed fields than a first glance would suggest, verified directly against each
  protocol's own source, not assumed. See product-spec.md §1.6 for the trust model.
- `forge script` doesn't work against CC3 Testnet (Foundry's local simulation panics on
  a missing `prevrandao` header field this chain doesn't set). Deploying there needs
  `forge create` per contract instead, see the deployment note linked above.

## Repo layout

```
miro/
├── contracts/
│   ├── source/       # Foundry project — DemoToken.sol + FixedMorphoOracle.sol, bootstrap a demo Morpho market (Ethereum Sepolia)
│   └── creditcoin/   # Foundry project — CreditPassport, PassportPool, TestUSDC, FixedPriceOracle (CC3 Testnet)
├── packages/
│   ├── shared/        # @miro/shared — ABIs, addresses, event topics, types
│   └── config/        # shared tsconfig / eslint presets
├── apps/
│   ├── worker/         # @miro/worker — the Attestcoin relay (listeners → proof → submit)
│   └── web/            # @miro/web — dApp UI (deferred)
└── docs/                # product spec, technical spec, integration writeup, demo script
```

Note: Aave V3 and Morpho Blue themselves are real, unmodified protocols, not part of this
repo — `contracts/source` only holds the demo assets needed to bootstrap a fresh Morpho
market (Aave needs no deploys at all, it uses Aave's own real testnet reserves).

## Setup

Requires [Foundry](https://getfoundry.sh) (`curl -L https://foundry.paradigm.xyz | bash && foundryup`),
Node 20+ / pnpm 9+, and [Bun](https://bun.com) (`curl -fsSL https://bun.com/install | bash`) — the
worker runs on Bun, tests still run on vitest.

```bash
# TS workspace
pnpm install

# Contracts — each is an independent Foundry project (no shared code between chains).
# --no-git avoids adding forge-std/openzeppelin as submodules of the outer repo; lib/ is
# gitignored, so run this after every fresh clone.
forge install foundry-rs/forge-std --no-git --root contracts/source
forge install OpenZeppelin/openzeppelin-contracts@v5.7.0 --no-git --root contracts/source
forge install foundry-rs/forge-std --no-git --root contracts/creditcoin
forge install OpenZeppelin/openzeppelin-contracts@v5.7.0 --no-git --root contracts/creditcoin
forge test --root contracts/source
forge test --root contracts/creditcoin

# Env
cp .env.example .env   # fill in RPC URLs, private keys, deployed addresses
```

Both projects build and their full test suites pass: 12/12 on `contracts/source`, 86/86 on
`contracts/creditcoin` (98/98 total; plus 28/28 on `apps/worker`).

## Deploying

```bash
# 1. Sepolia — deploys the demo Morpho market assets (loan token, collateral token,
#    oracle). Aave needs no deploy at all: it uses Aave's own real Sepolia Pool + Faucet.
forge script contracts/source/script/Deploy.s.sol \
  --rpc-url sepolia --private-key $DEPLOYER_PRIVATE_KEY --broadcast

# 2. CC3 Testnet — deploys TestUSDC, FixedPriceOracle, CreditPassport, PassportPool
forge script contracts/creditcoin/script/Deploy.s.sol \
  --rpc-url cc3_testnet --private-key $CC3_DEPLOYER_PRIVATE_KEY --broadcast

# 3. Register sources (Aave Repay, Morpho Repay) and the local reporter (PassportPool) on
#    the passport -- config, not a redeploy. apps/worker/src/e2e.ts does this
#    automatically on first run if they aren't registered yet.
```

`forge script` works fine on Sepolia, but panics against CC3 Testnet (Foundry's local
simulation needs a `prevrandao` header field this chain doesn't set). Use `forge create`
per contract instead for step 2 — see
[docs/attestcoin-integration.md](docs/attestcoin-integration.md#deployed-addresses) for
the exact commands and real Aave/Morpho Sepolia addresses.

## Running the worker

```bash
pnpm worker        # watches Aave + Morpho Repay events, relays proofs to CreditPassport
pnpm worker:e2e     # scripted demo flow — see docs/demo-script.md
```

## Trust model

State honestly, not oversold — see
[docs/product-spec.md §1.6](docs/product-spec.md#16-trust--risk-model-state-honestly-in-submission)
and [docs/attestcoin-integration.md](docs/attestcoin-integration.md).
