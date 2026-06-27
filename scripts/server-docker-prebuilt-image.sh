#!/bin/bash
# Собрать образ emkaro-app из уже готового .next/standalone (после npm run build на сервере).
set -euo pipefail

ROOT="${DEPLOY_ROOT:-/opt/emkaro}"
cd "$ROOT"

if [ ! -f "Dockerfile.prebuilt" ]; then
  echo "ОШИБКА: нет Dockerfile.prebuilt"
  exit 1
fi

if [ ! -d ".next/standalone" ] || [ ! -d ".next/static" ]; then
  echo "ОШИБКА: нет .next/standalone — соберите на Mac: bash scripts/local-build-for-deploy.sh"
  exit 1
fi

if [ -f "$ROOT/.deploy-version" ]; then
  export DEPLOY_VERSION="$(tr -d '\r' < "$ROOT/.deploy-version")"
else
  export DEPLOY_VERSION="unknown"
fi

IGNORE_BACKUP=""
if [ -f "$ROOT/.dockerignore" ]; then
  cp "$ROOT/.dockerignore" "$ROOT/.dockerignore.bak"
  IGNORE_BACKUP=1
fi
# .dockerignore по умолчанию исключает .next/ — для prebuilt нужны standalone + static
printf 'node_modules\n.git\nbackups\n.env\n.env.*\n.next/cache\n' > "$ROOT/.dockerignore"

echo ">>> docker build -f Dockerfile.prebuilt (контекст включает .next/standalone)..."
docker build -f Dockerfile.prebuilt \
  --build-arg CACHEBUST="${DEPLOY_VERSION}" \
  -t emkaro-app \
  "$ROOT"

if [ -n "$IGNORE_BACKUP" ]; then
  mv "$ROOT/.dockerignore.bak" "$ROOT/.dockerignore"
fi

echo ">>> docker compose up --no-build app caddy"
docker compose up -d --force-recreate --no-build app caddy
echo "PREBUILT_IMAGE_OK"
