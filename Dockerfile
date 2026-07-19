# CivicLink — Next.js multi-user + Playwright (Dokploy / Docker)
# Build context: repository root (pnpm workspace)

FROM mcr.microsoft.com/playwright:v1.61.1-jammy AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.1.2 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY web/package.json ./web/
RUN pnpm install --filter civiclink-web --frozen-lockfile

FROM mcr.microsoft.com/playwright:v1.61.1-jammy AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.1.2 --activate
COPY --from=deps /app/ ./
COPY web/ ./web/
WORKDIR /app/web
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# Prisma generate does not need a live DB
RUN pnpm exec prisma generate
RUN pnpm run build

FROM mcr.microsoft.com/playwright:v1.61.1-jammy AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV PLAYWRIGHT_HEADLESS=true

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/web/public ./public
COPY --from=builder /app/web/prisma ./prisma
COPY --from=builder /app/web/package.json ./package.json
# With outputFileTracingRoot at monorepo root, standalone nests under web/
COPY --from=builder --chown=nextjs:nodejs /app/web/.next/standalone/web ./
COPY --from=builder --chown=nextjs:nodejs /app/web/.next/standalone/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/web/.next/static ./.next/static

# Prisma client + CLI for migrate on boot
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma

COPY web/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh \
  && chown nextjs:nodejs /app/docker-entrypoint.sh

USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "server.js"]
