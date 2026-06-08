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
ENV APP_ROOT_DOMAIN=$APP_ROOT_DOMAIN
ENV AUTH_SECRET=$AUTH_SECRET
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=--max-old-space-size=2048
RUN test -n "$AUTH_SECRET" || (echo "ERROR: set AUTH_SECRET in /opt/emkaro/.env before docker compose build" && exit 1)
RUN npm run build || (echo "=== npm run build failed ===" && exit 1)
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

RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
