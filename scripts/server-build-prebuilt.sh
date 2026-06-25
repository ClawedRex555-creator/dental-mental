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

echo ">>> Prebuilt path: npm ci + build on host..."
docker run --rm -v "$ROOT:/app" -w /app node:20-alpine sh -c '
  set -e
  apk add --no-cache libc6-compat
  npm config set registry https://registry.npmmirror.com
  npm config set fetch-retries 5
  npm ci --no-audit --no-fund
  npm run build
'

test -d "$ROOT/.next/standalone" || { echo "ОШИБКА: нет .next/standalone после build"; exit 1; }

IGNORE_BACKUP=""
if [ -f "$ROOT/.dockerignore" ]; then
  cp "$ROOT/.dockerignore" "$ROOT/.dockerignore.bak"
  IGNORE_BACKUP=1
fi
printf 'node_modules\n.git\nbackups\n.env\n.env.*\n' > "$ROOT/.dockerignore"

echo ">>> docker build -f Dockerfile.prebuilt ..."
docker build -f Dockerfile.prebuilt \
  --build-arg CACHEBUST="${DEPLOY_VERSION}" \
  -t emkaro-app \
  "$ROOT"

if [ -n "$IGNORE_BACKUP" ]; then
  mv "$ROOT/.dockerignore.bak" "$ROOT/.dockerignore"
fi

echo ">>> Перезапуск app + caddy..."
docker compose up -d --force-recreate app caddy
echo "PREBUILT_OK"
