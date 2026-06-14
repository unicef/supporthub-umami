ARG NODE_IMAGE_VERSION="22-alpine"

# Install dependencies only when needed
FROM node:${NODE_IMAGE_VERSION} AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app
# pnpm-workspace.yaml carries onlyBuiltDependencies/ignoredBuiltDependencies —
# without it, strict pnpm fails `install` on every package with a build script.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Pin pnpm: latest (10.16+/11) hard-errors on ignored build scripts. 10.0.0 is
# what the lockfile (v9.0) was built with and only warns.
RUN npm install -g pnpm@10.0.0
RUN pnpm install --frozen-lockfile

# Rebuild the source code only when needed
FROM node:${NODE_IMAGE_VERSION} AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
COPY docker/proxy.ts ./src

ARG BASE_PATH

ENV BASE_PATH=$BASE_PATH
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="postgresql://user:pass@localhost:5432/dummy"

RUN npm run build-docker

# Production image, copy all the files and run next
FROM node:${NODE_IMAGE_VERSION} AS runner
WORKDIR /app

# SupportHub fork: these MUST match the app's resolved versions in
# pnpm-lock.yaml. Next's output tracing copies PARTIAL slices of the startup
# scripts' deps into .next/standalone/node_modules; the runner re-adds the
# COMPLETE packages below. When the versions match, the complete + partial
# copies merge into one (complete) package — when they drift (e.g. `pnpm add`
# resolving `latest`), the partial copy shadows the complete one and
# `node scripts/check-db.js` crashes at boot (missing semver/index.js,
# @prisma/client, ...). Bump these in lockstep with package.json on upgrades.
ARG PRISMA_VERSION="7.6.0"
ARG SEMVER_VERSION="7.7.4"
ARG NPM_RUN_ALL_VERSION="4.1.5"
ARG DOTENV_VERSION="17.3.1"
ARG CHALK_VERSION="5.6.2"
ARG NODE_OPTIONS

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=$NODE_OPTIONS

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
RUN set -x \
    && apk add --no-cache curl \
    && npm install -g pnpm@10.0.0

# Script dependencies (for scripts/check-db.js + scripts/update-tracker.js run
# by `pnpm start-docker`). Pinned to the lockfile versions (see note above).
# The pre-seeded package.json `onlyBuiltDependencies` is pnpm 10's portable
# equivalent of `--allow-build` (10.0.0 has no such flag) so prisma's native
# engines build.
RUN printf '{"name":"umami-runner","private":true,"pnpm":{"onlyBuiltDependencies":["@prisma/engines","prisma","@prisma/client"]}}' > package.json \
    && pnpm add \
       npm-run-all@${NPM_RUN_ALL_VERSION} \
       dotenv@${DOTENV_VERSION} \
       chalk@${CHALK_VERSION} \
       semver@${SEMVER_VERSION} \
       prisma@${PRISMA_VERSION} \
       @prisma/client@${PRISMA_VERSION} \
       @prisma/adapter-pg@${PRISMA_VERSION}

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/generated ./generated

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV HOSTNAME=0.0.0.0
ENV PORT=3000

CMD ["pnpm", "start-docker"]
