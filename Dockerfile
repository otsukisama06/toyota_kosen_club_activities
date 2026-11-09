# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS base
WORKDIR /workspace
ENV NEXT_TELEMETRY_DISABLED=1
ENV NPM_CONFIG_REGISTRY=https://registry.npmjs.org/
ENV NPM_CONFIG_FETCH_RETRIES=5
ENV NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000
ENV NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000
ENV NPM_CONFIG_FETCH_TIMEOUT=300000
ENV NPM_CONFIG_AUDIT=false
ENV NPM_CONFIG_FUND=false

RUN apk add --no-cache openssl libc6-compat

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/table-tennis/package.json apps/table-tennis/package-lock.json ./apps/table-tennis/
COPY apps/handball/package.json apps/handball/package-lock.json ./apps/handball/
RUN set -eux; \
  npm ci --no-audit --no-fund & root_ci_pid=$!; \
  npm --prefix apps/table-tennis ci --no-audit --no-fund & table_tennis_ci_pid=$!; \
  npm --prefix apps/handball ci --no-audit --no-fund & handball_ci_pid=$!; \
  wait $root_ci_pid; \
  wait $table_tennis_ci_pid; \
  wait $handball_ci_pid; \
  npm cache clean --force; \
  rm -rf /root/.npm

FROM base AS builder
COPY --from=deps /workspace/node_modules ./node_modules
COPY --from=deps /workspace/apps/table-tennis/node_modules ./apps/table-tennis/node_modules
COPY --from=deps /workspace/apps/handball/node_modules ./apps/handball/node_modules
COPY . .

# git では空ディレクトリが消えないため、migration.sql の無い古いマイグレーションディレクトリを除去する（P3015 対策）
RUN find apps/handball/prisma/migrations apps/table-tennis/prisma/migrations -mindepth 1 -maxdepth 1 -type d -empty -exec rm -rf {} +

ARG BUILD_NODE_OPTIONS=--max-old-space-size=1024
ENV NODE_OPTIONS=${BUILD_NODE_OPTIONS}

ENV NODE_ENV=production
ENV NEXT_PUBLIC_APP_BASE_URL=http://localhost:3000
ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres?schema=public
ENV ADMIN_VIEW_KEY=placeholder

RUN sh -c 'set -e; \
  n=0; \
  until [ "$n" -ge 5 ]; do \
    npm --prefix apps/table-tennis run db:generate && break; \
    n=$((n + 1)); \
    echo "table-tennis prisma generate failed (attempt ${n}/5). retrying..."; \
    sleep $((n * 5)); \
  done; \
  [ "$n" -lt 5 ]'
RUN sh -c 'set -e; \
  n=0; \
  until [ "$n" -ge 5 ]; do \
    npm --prefix apps/handball run db:generate && break; \
    n=$((n + 1)); \
    echo "handball prisma generate failed (attempt ${n}/5). retrying..."; \
    sleep $((n * 5)); \
  done; \
  [ "$n" -lt 5 ]'
RUN sh -c 'set -e; \
  npm --prefix apps/table-tennis run build & table_tennis_build_pid=$!; \
  npm --prefix apps/handball run build & handball_build_pid=$!; \
  wait $table_tennis_build_pid; \
  wait $handball_build_pid; \
  npm prune --omit=dev --omit=optional --no-audit --no-fund; \
  npm --prefix apps/table-tennis prune --omit=dev --omit=optional --no-audit --no-fund; \
  npm --prefix apps/handball prune --omit=dev --omit=optional --no-audit --no-fund; \
  npm cache clean --force; \
  rm -rf /root/.npm /workspace/apps/table-tennis/.next/cache /workspace/apps/handball/.next/cache'

FROM base AS runner
ENV NODE_ENV=production

COPY --from=builder /workspace/node_modules ./node_modules
COPY --from=builder /workspace/apps/table-tennis/node_modules ./apps/table-tennis/node_modules
COPY --from=builder /workspace/apps/handball/node_modules ./apps/handball/node_modules

COPY --from=builder /workspace/gateway ./gateway

COPY --from=builder /workspace/apps/handball/package.json ./apps/handball/package.json
COPY --from=builder /workspace/apps/handball/prisma.config.ts ./apps/handball/prisma.config.ts
COPY --from=builder /workspace/apps/handball/prisma ./apps/handball/prisma
COPY --from=builder /workspace/apps/handball/public ./apps/handball/public
COPY --from=builder /workspace/apps/handball/.next/standalone ./apps/handball/.next/standalone
COPY --from=builder /workspace/apps/handball/.next/static ./apps/handball/.next/standalone/apps/handball/.next/static
COPY --from=builder /workspace/apps/handball/public ./apps/handball/.next/standalone/public

COPY --from=builder /workspace/apps/table-tennis/package.json ./apps/table-tennis/package.json
COPY --from=builder /workspace/apps/table-tennis/prisma.config.ts ./apps/table-tennis/prisma.config.ts
COPY --from=builder /workspace/apps/table-tennis/prisma ./apps/table-tennis/prisma
COPY --from=builder /workspace/apps/table-tennis/public ./apps/table-tennis/public
COPY --from=builder /workspace/apps/table-tennis/.next/standalone ./apps/table-tennis/.next/standalone
COPY --from=builder /workspace/apps/table-tennis/.next/static ./apps/table-tennis/.next/standalone/apps/table-tennis/.next/static
COPY --from=builder /workspace/apps/table-tennis/public ./apps/table-tennis/.next/standalone/public

EXPOSE 3000

CMD ["node", "gateway/server.cjs"]
