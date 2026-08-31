# @miro/web

Next.js (App Router) dashboard for Miro's cross-chain credit passport: connect a wallet,
see your `CreditPassport.scoreOf()`, and interact with `PassportPool` (deposit collateral,
borrow, repay, withdraw). See the root [README.md](../../README.md) and
[docs/](../../docs) for the product/protocol.

## Setup

```bash
cp .env.local.example .env.local   # fill in the NEXT_PUBLIC_* addresses (root .env.example documents them)
pnpm install                        # from the repo root
pnpm --filter @miro/web dev
```

## Stack

- **Next.js 16** (App Router, Turbopack) + Tailwind CSS
- **wagmi v2 + viem** for chain/account state -- wagmi's hooks run on `@tanstack/react-query` natively
- **`@wagmi/cli`** generates typed per-function hooks (`src/generated.ts`) straight from the
  ABIs in `@miro/shared` -- run `pnpm wagmi:generate` after an ABI changes. Regenerate, don't
  hand-edit `src/generated.ts`.
- **React Hook Form + Zod** for the four PassportPool forms
- No RainbowKit: its default wallet list pulls in a connector whose dependency chain
  doesn't resolve under Next 16 + Turbopack SSR. `src/components/ConnectButton.tsx` is a
  small hand-rolled connect UI built directly on wagmi's own hooks instead.

## Architecture

```text
src/
├── generated.ts        # wagmi-cli output -- one hook per contract function
├── lib/                 # chains, wagmi config, contract-address resolver (env -> address)
├── hooks/                # domain hooks: usePassportScore, usePassportPoolPosition,
│                         # useDepositCollateral/useBorrow/useRepay/useWithdrawCollateral
├── schemas/              # zod schemas for the forms
├── components/           # ScoreCard, PoolPositionCard, ConnectButton, forms/
└── app/                  # / (passport dashboard), /pool (PassportPool actions)
```

Components only ever call the `hooks/` layer, never `src/generated.ts` or `process.env`
directly -- see the hook files themselves for the DRY/SOLID reasoning behind that split.
