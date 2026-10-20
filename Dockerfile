FROM node:24-alpine AS deps
WORKDIR /app

RUN apk add --no-cache python3 make g++ libc6-compat

COPY .yarnrc.yml package.json yarn.lock ./
RUN corepack enable && yarn install --immutable

FROM node:24-alpine AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN corepack enable && yarn build && yarn build:import-worker

FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3014
ENV HOSTNAME=0.0.0.0
ENV DATABASE_URL=/data/db.sqlite
ENV FOOD_IMPORT_WORKER=/app/import-worker.mjs

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    mkdir -p /data && chown nextjs:nodejs /data

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/build/import-worker.mjs ./import-worker.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/backup-database.ts ./scripts/backup-database.ts
COPY --from=builder --chown=nextjs:nodejs /app/lib/db/backup.ts /app/lib/db/url.ts ./lib/db/

USER nextjs

EXPOSE 3014

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3014/api/trpc/health.check').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

VOLUME ["/data"]

CMD ["node", "server.js"]
