FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json* ./
# lockfile may drift on deploy machines; npm install is more tolerant than npm ci
RUN npm install --no-audit --no-fund
FROM node:20-alpine AS builder
WORKDIR /app
ARG APP_ROOT_DOMAIN=emkaro.ru
ARG AUTH_SECRET
ARG CACHEBUST=unknown
ENV APP_ROOT_DOMAIN=$APP_ROOT_DOMAIN
ENV AUTH_SECRET=$AUTH_SECRET
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN test -f .deploy-version || echo "local-build" > .deploy-version
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=--max-old-space-size=2048
RUN test -n "$AUTH_SECRET" || (echo "ERROR: set AUTH_SECRET in /opt/emkaro/.env before docker compose build" && exit 1)
RUN chmod +x scripts/fix-stale-routes.sh && sh scripts/fix-stale-routes.sh /app
RUN grep -q 'patientAppointmentSearch' app/api/health/route.ts || (echo "ERROR: stale source — redeploy fresh tar from Mac" && exit 1)
RUN grep -q 'egiszCdaSnilsDigits' app/api/health/route.ts || (echo "ERROR: health route без egiszCdaSnilsDigits — задеплойте свежий tar" && exit 1)
RUN grep -q 'egiszDocumentUuidAlign' app/api/health/route.ts || (echo "ERROR: health route без egiszDocumentUuidAlign" && exit 1)
RUN grep -q 'documentUuid' lib/egisz/worker.server.ts || (echo "ERROR: worker без documentUuid для N3" && exit 1)
RUN grep -q 'normalizeSnilsDigits' lib/egisz/cda/builder.ts || (echo "ERROR: CDA builder без normalizeSnilsDigits" && exit 1)
RUN test -f components/shared/patient-search-select.tsx || (echo "ERROR: missing patient-search-select.tsx" && exit 1)
# CACHEBUST сбрасывает кэш next build при каждом деплое (иначе возможен старый bundle + новый DEPLOY_VERSION)
RUN echo "build cache bust: $CACHEBUST"
RUN set -o pipefail && npm run build 2>&1 | tee /tmp/next-build.log || (echo "=== npm run build failed ===" && tail -80 /tmp/next-build.log && exit 1)
RUN test -d .next/standalone && test -d .next/static || (echo "=== missing .next output ===" && ls -la .next 2>&1 && exit 1)
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/db ./db
COPY --from=builder /app/.deploy-version ./.deploy-version

RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
