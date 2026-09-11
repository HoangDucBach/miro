# Deploying

Three parts. The web app is stateless; the worker and Redis are one unit.

## Web app

Vercel or any Node host. Build from the repo root so the workspace resolves:

```
pnpm install
pnpm --filter @miro/web build
pnpm --filter @miro/web start
```

Every `NEXT_PUBLIC_*` variable in `apps/web/.env.local.example` must be set at build time;
Next.js inlines them. Routes are server-rendered (the layout reads the wallet cookie), so
the app cannot be exported as static files.

## Worker + Redis

One VM with Docker is enough. The worker holds no state of its own; the scan cursor and
the relay queue live in Redis, so Redis must persist across restarts or the worker
restarts from the current head and misses anything emitted while it was down.

```
git clone https://github.com/HoangDucBach/miro && cd miro
cp .env.example .env        # fill in: RPC URLs, WORKER_PRIVATE_KEY, contract addresses
docker compose up -d --build
docker compose logs -f worker
```

`docker-compose.yml` builds `apps/worker/Dockerfile` and points it at the bundled Redis
(`REDIS_URL=redis://redis:6379`, overriding whatever `.env` says for local runs). Redis
data is a named volume.

What the worker needs in `.env`:

| Variable | Why |
|---|---|
| `SEPOLIA_RPC`, `CC3_RPC` | source chain to scan, Creditcoin to submit to |
| `WORKER_PRIVATE_KEY` | pays gas for `processAttestation` on CC3; keep it funded with tCTC |
| `CREDIT_PASSPORT_CONTRACT` | where proofs go |
| `AAVE_POOL_CONTRACT`, `MORPHO_CONTRACT` | what to scan; omit one to watch only the other |
| `PROVER_URL` | hosted USC prover, defaults to the CC3 testnet one |
| `SCAN_LOOKBACK_BLOCKS` | first run only; `300` ≈ the last hour on Sepolia. Restarts resume the saved cursor and ignore this |

Keep `.env` free of inline comments (`KEY=value  # note`): `docker run --env-file` keeps the
comment as part of the value. Compose and dotenv strip it, so it only bites outside compose.

Without Docker, the same thing by hand:

```
pnpm install
docker run -d --name miro-redis -p 6379:6379 redis:7-alpine
pnpm --filter @miro/worker start
```

## Checking it works

- `docker compose logs worker` shows `listening on Aave Repay (...), Morpho Repay (...)`.
- `docker compose exec redis redis-cli get scanner:cursor:1` returns a block number that
  advances every ~12 s.
- A repayment on either protocol appears as `queued <label> <tx> @ block N`, then after
  Creditcoin attests that block (minutes), `submitted <tx>: <cc3 tx>`.
