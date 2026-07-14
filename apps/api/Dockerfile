FROM node:22.17.1-bookworm-slim@sha256:2fa754a9ba4d7adbd2a51d182eaabbe355c82b673624035a38c0d42b08724854 AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ARG COREPACK_NPM_REGISTRY=https://registry.npmjs.org
ENV COREPACK_NPM_REGISTRY=$COREPACK_NPM_REGISTRY
ENV npm_config_registry=$COREPACK_NPM_REGISTRY
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && corepack prepare pnpm@10.13.1 --activate
WORKDIR /app

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM dependencies AS build
COPY apps/api apps/api
COPY packages/contracts packages/contracts
RUN pnpm --filter @cadir/contracts build && pnpm --filter @cadir/api db:generate && pnpm --filter @cadir/api build

FROM node:22.17.1-bookworm-slim@sha256:2fa754a9ba4d7adbd2a51d182eaabbe355c82b673624035a38c0d42b08724854 AS runtime
ENV NODE_ENV=production
WORKDIR /app/apps/api
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 cadir \
    && useradd --uid 10001 --gid cadir --no-create-home --shell /usr/sbin/nologin cadir
COPY --from=build --chown=cadir:cadir /app/node_modules /app/node_modules
COPY --from=build --chown=cadir:cadir /app/apps/api/node_modules ./node_modules
COPY --from=build --chown=cadir:cadir /app/apps/api/dist ./dist
COPY --from=build --chown=cadir:cadir /app/apps/api/prisma ./prisma
COPY --from=build --chown=cadir:cadir /app/apps/api/package.json ./package.json
COPY --from=build --chown=cadir:cadir /app/packages/contracts /app/packages/contracts
USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 CMD ["node", "-e", "fetch('http://127.0.0.1:8080/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["sh", "-c", "umask 0007 && node node_modules/prisma/build/index.js migrate deploy && exec node dist/server.js"]
