#!/bin/bash
# Host-side npm build + Dockerfile.prebuilt when `docker compose build` fails (DNS/npm on VPS).
# Usage (on server): bash scripts/server-build-prebuilt.sh
set -euo pipefail

ROOT="${DEPLOY_ROOT:-/opt/emkaro}"
cd "$ROOT"

if [ ! -f "Dockerfile.prebuilt" ]; then
  echo "ОШИБКА: нет Dockerfile.prebuilt в $ROOT"
  exit 1
fi

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

test -n "${AUTH_SECRET:-}" || { echo "ОШИБКА: задайте AUTH_SECRET в .env"; exit 1; }

if [ -f "$ROOT/.deploy-version" ]; then
  export DEPLOY_VERSION="$(tr -d '\r' < "$ROOT/.deploy-version")"
else
  export DEPLOY_VERSION="unknown"
fi

log() {
  echo ">>> [prebuilt $(date -u +%H:%M:%S)] $*"
}

if [ -f "$ROOT/.deploy-next-bundle" ] && [ -d "$ROOT/.next/standalone" ]; then
  log "готовый .next из архива — npm на сервере пропущен"
else
  log "npm ci + next build в node:20-alpine (медленно; деплойте с Mac: bash scripts/deploy-to-server.sh)"
  log "npm ci ~3–10 мин на VPS — ETIMEDOUT возможен"

docker run --rm --network host -v "$ROOT:/app" -w /app \
  -e AUTH_SECRET="${AUTH_SECRET}" \
  -e APP_ROOT_DOMAIN="${APP_ROOT_DOMAIN:-emkaro.ru}" \
  -e NEXT_TELEMETRY_DISABLED=1 \
  -e NODE_OPTIONS=--max-old-space-size=2048 \
  node:20-alpine sh -c '
  set -e
  step() { echo ">>> [prebuilt $(date -u +%H:%M:%S)] $*"; }

  # libc6-compat опционален; зеркало Aliyun на VPS часто падает — не блокируем сборку
  step "optional: libc6-compat (apk, до 45 с)"
  if command -v timeout >/dev/null 2>&1; then
    timeout 45 apk add --no-cache libc6-compat 2>/dev/null || \
      timeout 45 sh -c "sed -i \"s/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g\" /etc/apk/repositories && apk add --no-cache libc6-compat" 2>/dev/null || \
      step "libc6-compat пропущен — продолжаем без него"
  else
    apk add --no-cache libc6-compat 2>/dev/null || step "libc6-compat пропущен"
  fi

  chmod +x scripts/fix-stale-routes.sh && sh scripts/fix-stale-routes.sh /app

  step "npm ci"
  npm config set registry https://registry.npmmirror.com
  npm config set fetch-retries 8
  npm config set fetch-timeout 300000
  npm config set fetch-retry-mintimeout 20000
  npm config set fetch-retry-maxtimeout 300000
  npm ci --no-audit --no-fund --prefer-offline 2>/dev/null || npm ci --no-audit --no-fund
  test -x node_modules/.bin/next || (echo "ERROR: next CLI missing after npm ci" && exit 1)
  test -n "$AUTH_SECRET" || (echo "ERROR: AUTH_SECRET required for build" && exit 1)

  step "npm run build"
  npm run build
  step "next build finished"
'

test -d "$ROOT/.next/standalone" || { echo "ОШИБКА: нет .next/standalone после build"; exit 1; }
fi

log "docker image из .next/standalone"
bash scripts/server-docker-prebuilt-image.sh
echo "PREBUILT_OK"
