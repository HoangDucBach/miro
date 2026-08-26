# Built and run with Bun. Build context must be the repo root (needed to resolve the
# @miro/shared workspace package), e.g.:
#   docker build -f apps/worker/Dockerfile -t miro-worker .
FROM oven/bun:1 AS base
WORKDIR /repo

# Install dependencies first, keyed only on manifests, so this layer is cached across
# source-only changes.
COPY package.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/config/package.json packages/config/package.json
RUN bun install

# Now bring in the actual source.
COPY packages/shared packages/shared
COPY packages/config packages/config
COPY apps/worker apps/worker

WORKDIR /repo/apps/worker
ENV NODE_ENV=production

CMD ["bun", "run", "src/index.ts"]
