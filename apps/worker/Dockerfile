# Relay worker. Built from the repo root so the workspace package it depends on
# (@miro/shared, raw TypeScript, no build step) is in the context:
#
#   docker build -f apps/worker/Dockerfile -t miro-worker .
#
# Installed with pnpm against the committed lockfile, run with bun: the worker executes
# .ts straight from source and bun resolves the workspace's ".js"-suffixed specifiers
# without a compile step. Node is only here for pnpm.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/config/package.json packages/config/
COPY apps/worker/package.json apps/worker/
# --filter with "..." pulls the worker and every workspace package it depends on, and
# nothing else: the web app's toolchain never enters this image.
# --ignore-scripts: the only install scripts in this tree are optional native addons
# (bufferutil, utf-8-validate, msgpackr-extract) that need a C toolchain to compile and
# that ws and bullmq fall back from transparently when absent. Skipping them keeps the
# image free of python/make/g++.
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @miro/worker...

FROM oven/bun:1.3-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY packages/shared ./packages/shared
COPY packages/config ./packages/config
COPY apps/worker ./apps/worker
WORKDIR /app/apps/worker
# Configuration comes from the container environment, not a file; dotenv/config in the
# entrypoint is a no-op when there is no .env, which is the case here by .dockerignore.
CMD ["bun", "run", "src/index.ts"]
