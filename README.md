# Miro

Borrow against your unvested token grant. Vesting positions already exist on
[Sablier](https://sablier.com) — a real, live protocol on Ethereum, not something we wrote;
the [Attestcoin Protocol](https://creditcoin.org) cryptographically proves the remaining
locked value of that position on Creditcoin; the holder receives a bank-style credit
line — no need to sell tokens early to get cash.

> **BUIDL CTC 2026 Fall — DeFi Track.** Full spec: [docs/product-spec.md](docs/product-spec.md)
> · [docs/technical-spec.md](docs/technical-spec.md) · required deep-dive:
> [docs/attestcoin-integration.md](docs/attestcoin-integration.md).

## Status

Pivoted from an earlier salary-stream design to token-vesting collateral (see
[technical-spec.md §2.9](docs/technical-spec.md#29-migration-to-the-token-vesting-design-post-day-16-pivot)
for why). Contracts and worker are rewritten and fully tested locally against the new
design (114/114 Foundry tests, 25/25 worker tests); **not yet redeployed** to Sepolia/CC3
Testnet under this design — the addresses in
[docs/attestcoin-integration.md](docs/attestcoin-integration.md#deployed-addresses) are
still from the prior salary-stream deployment and need refreshing. `apps/web` is still
deferred.

- [`contracts/creditcoin/src/libs/`](contracts/creditcoin/src/libs/) — `EvmV1Decoder.sol` and
  `NativeQueryVerifier.sol` are vendored verbatim from the real reference implementation
  (`@gluwa/usc-contracts@0.1.2`, `gluwa/attestcoin-protocol-examples`), pinned to the same
  versions that repo's own `package.json` uses, with attribution headers. Not stubs.
- [`apps/worker/src/lib/chain.ts`](apps/worker/src/lib/chain.ts) /
  [`proof.ts`](apps/worker/src/lib/proof.ts) — written against and typechecked against the
  real installed `@gluwa/usc-sdk@0.18.0` package, not just the spec's description of it.
  The full proof pipeline (chainKey resolution, fetching a real proof, on-chain
  verification, decoding real tx bytes) was run end to end against the live network
  before any of our own contracts were deployed.
- `StreamVerifierASC.sol` now decodes Sablier's real `CreateLockupLinearStream` /
  `WithdrawFromLockupStream` events (field names verified against
  `sablier-labs/sdk/abi/lockup/v4.0/SablierLockup.json`), and only accepts streams that
  are provably `!cancelable && !transferable` — see product-spec.md §1.6.
- `forge script` doesn't work against CC3 Testnet (Foundry's local simulation panics on
  a missing `prevrandao` header field this chain doesn't set). Deploying there needs
  `forge create` per contract instead, see the deployment note linked above.

## Repo layout

```
miro/
├── contracts/
│   ├── source/       # Foundry project — NebulaToken.sol, the demo collateral token (Ethereum Sepolia)
│   └── creditcoin/   # Foundry project — StreamVerifierASC, CreditPool, TestUSDC, FixedPriceOracle (CC3 Testnet)
├── packages/
│   ├── shared/        # @miro/shared — ABIs, addresses, event topics, types
│   └── config/        # shared tsconfig / eslint presets
├── apps/
│   ├── worker/         # @miro/worker — the Attestcoin relay (listeners → proof → submit)
│   └── web/            # @miro/web — dApp UI (deferred)
└── docs/                # product spec, technical spec, integration writeup, demo script
```

Note: the vesting stream itself lives on Sablier's real `SablierLockup` contract, not in
this repo — `contracts/source` only holds the demo collateral token.

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

Both projects build and their full test suites pass: 5/5 on `contracts/source`, 109/109 on
`contracts/creditcoin` (114/114 total).

## Deploying

```bash
# 1. Sepolia — deploys the demo NebulaToken. The vesting stream itself is created directly
#    against Sablier's real, already-deployed SablierLockup contract, not deployed by us.
forge script contracts/source/script/Deploy.s.sol \
  --rpc-url sepolia --private-key $DEPLOYER_PRIVATE_KEY --broadcast

# 2. Resolve Sepolia's Creditcoin-internal chainKey (NOT the EVM chainId — §2.1), and look
#    up Sablier's real SablierLockup address on Sepolia (see attestcoin-integration.md).
#    Set SABLIER_LOCKUP_CONTRACT + SOURCE_CHAIN_KEY before the next step.

# 3. CC3 Testnet — deploys TestUSDC, FixedPriceOracle, StreamVerifierASC, CreditPool
forge script contracts/creditcoin/script/Deploy.s.sol \
  --rpc-url cc3_testnet --private-key $CC3_DEPLOYER_PRIVATE_KEY --broadcast

# 4. Whitelist NebulaToken as CreditPool collateral (apps/worker/src/e2e.ts does this
#    automatically on first run if it isn't whitelisted yet).
```

`forge script` works fine on Sepolia, but panics against CC3 Testnet (Foundry's local
simulation needs a `prevrandao` header field this chain doesn't set). Use `forge create`
per contract instead for step 3 — see
[docs/attestcoin-integration.md](docs/attestcoin-integration.md#deployed-addresses) for
the exact commands (addresses there are from the prior salary-stream deployment and need
refreshing for this design).

## Running the worker

```bash
pnpm worker        # listens for Sablier Lockup events, relays proofs to StreamVerifierASC
pnpm worker:e2e     # scripted demo flow — see docs/demo-script.md
```

## Trust model

State honestly, not oversold — see
[docs/product-spec.md §1.6](docs/product-spec.md#16-trust--risk-model-state-honestly-in-submission)
and [docs/attestcoin-integration.md](docs/attestcoin-integration.md).
