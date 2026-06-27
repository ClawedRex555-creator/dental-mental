#!/bin/bash
# Linux standalone: npm ci + next build в node:20-alpine на Mac.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

export AUTH_SECRET="${AUTH_SECRET:-deploy-local-build-secret}"
export APP_ROOT_DOMAIN="${APP_ROOT_DOMAIN:-emkaro.ru}"
export NEXT_TELEMETRY_DISABLED=1

if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo "ОШИБКА: запустите Docker Desktop на Mac и повторите deploy."
  exit 1
fi

echo ">>> Сборка Next в node:20-alpine (linux bundle для сервера)..."

docker run --rm \
  --dns 8.8.8.8 \
  --dns 1.1.1.1 \
  -v "$ROOT:/app" \
  -v emkaro-npm-cache:/root/.npm \
  -w /app \
  -e AUTH_SECRET \
  -e APP_ROOT_DOMAIN \
  -e NEXT_TELEMETRY_DISABLED=1 \
  -e NODE_OPTIONS=--max-old-space-size=4096 \
  node:20-alpine sh -c '
  set -e
  npm config set registry https://registry.npmjs.org
  npm config set fetch-retries 10
  npm config set fetch-timeout 300000
  attempt=1
  while [ "$attempt" -le 5 ]; do
    echo ">>> npm ci ($attempt/5)"
    if npm ci --no-audit --no-fund; then break; fi
    [ "$attempt" -eq 5 ] && exit 1
    attempt=$((attempt + 1))
    sleep 15
  done
  test -x node_modules/.bin/next
  echo ">>> npm run build"
  npm run build
'

test -d .next/standalone || { echo "ОШИБКА: нет .next/standalone"; exit 1; }
test -d .next/static || { echo "ОШИБКА: нет .next/static"; exit 1; }

{
  echo "built_at=$(date -u +%Y-%m-%dT%H:%MZ)"
  echo "commit=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
  echo "platform=linux-musl"
} > .deploy-next-bundle

echo ">>> Готово: .next/standalone"
