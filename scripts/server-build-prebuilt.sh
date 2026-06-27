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

echo ">>> Prebuilt path: npm ci + build in node:20-alpine (без Docker Hub)..."
docker run --rm -v "$ROOT:/app" -w /app \
  -e AUTH_SECRET="${AUTH_SECRET}" \
  -e APP_ROOT_DOMAIN="${APP_ROOT_DOMAIN:-emkaro.ru}" \
  -e NEXT_TELEMETRY_DISABLED=1 \
  -e NODE_OPTIONS=--max-old-space-size=2048 \
  node:20-alpine sh -c '
  set -e
  # dl-cdn.alpinelinux.org часто падает по TLS на VPS — то же зеркало, что в Dockerfile
  sed -i "s/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g" /etc/apk/repositories
  if ! apk add --no-cache libc6-compat; then
    echo "ПРЕДУПРЕЖДЕНИЕ: libc6-compat не установлен — пробуем сборку без него"
  fi
  chmod +x scripts/fix-stale-routes.sh && sh scripts/fix-stale-routes.sh /app
  npm config set registry https://registry.npmmirror.com
  npm config set fetch-retries 5
  npm ci --no-audit --no-fund
  test -x node_modules/.bin/next || (echo "ERROR: next CLI missing after npm ci" && exit 1)
  test -n "$AUTH_SECRET" || (echo "ERROR: AUTH_SECRET required for build" && exit 1)
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

COMPOSE_IMAGE="$(docker compose config --images app 2>/dev/null || true)"
if [ -n "$COMPOSE_IMAGE" ] && [ "$COMPOSE_IMAGE" != "emkaro-app" ]; then
  docker tag emkaro-app "$COMPOSE_IMAGE"
  echo ">>> Образ помечен как $COMPOSE_IMAGE"
fi

echo ">>> Перезапуск app + caddy (без повторной сборки через Docker Hub)..."
docker compose up -d --force-recreate --no-build app caddy
echo "PREBUILT_OK"
