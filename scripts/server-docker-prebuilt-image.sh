#!/bin/bash
# Собрать образ emkaro-app из уже готового .next/standalone (после npm run build на сервере).
set -euo pipefail

ROOT="${DEPLOY_ROOT:-/opt/emkaro}"
cd "$ROOT"

BUILD_ONLY=0
if [ "${1:-}" = "--build-only" ]; then
  BUILD_ONLY=1
fi

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

# Docker tag: только short commit из строки "branch <commit> <timestamp>"
IMAGE_TAG="$(echo "$DEPLOY_VERSION" | awk '{print $2}')"
IMAGE_TAG="${IMAGE_TAG:-unknown}"
IMAGE_TAG="$(echo "$IMAGE_TAG" | tr -cd 'a-zA-Z0-9_.-')"
IMAGE_TAG="${IMAGE_TAG:-unknown}"
export EMKARO_IMAGE_TAG="$IMAGE_TAG"

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
  -t emkaro-app:latest \
  -t "emkaro-app:${EMKARO_IMAGE_TAG}" \
  "$ROOT"

if [ -n "$IGNORE_BACKUP" ]; then
  mv "$ROOT/.dockerignore.bak" "$ROOT/.dockerignore"
fi

if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env"
  set +a
fi

echo ">>> Smoke: запуск server.js (до 8 сек)..."
smoke_log="$(mktemp)"
set +e
timeout 8 docker run --rm \
  -e NODE_ENV=production \
  -e AUTH_SECRET="${AUTH_SECRET:?set AUTH_SECRET in .env}" \
  -e PHI_ENCRYPTION_KEY="${PHI_ENCRYPTION_KEY:?set PHI_ENCRYPTION_KEY in .env}" \
  -e ENABLE_DEMO_ACCOUNTS=false \
  -e APP_ROOT_DOMAIN="${APP_ROOT_DOMAIN:?set APP_ROOT_DOMAIN in .env}" \
  -e DATABASE_URL="postgresql://mis:${POSTGRES_PASSWORD:?}@127.0.0.1:5432/dentalcloud" \
  -e DEPLOY_VERSION="${DEPLOY_VERSION}" \
  emkaro-app:latest node server.js >"$smoke_log" 2>&1
smoke_rc=$?
set -e
if ! grep -qE 'Ready|Next\.js' "$smoke_log"; then
  echo "ОШИБКА: образ не стартует (smoke test)."
  tail -40 "$smoke_log"
  rm -f "$smoke_log"
  exit 1
fi
echo "Smoke OK"
rm -f "$smoke_log"

if [ "$BUILD_ONLY" = "1" ]; then
  echo "PREBUILT_IMAGE_OK (build-only)"
  exit 0
fi

echo ">>> docker compose up (image: emkaro-app:${EMKARO_IMAGE_TAG})"
# Rollback: EMKARO_IMAGE_TAG="<commit>" docker compose up -d --force-recreate --no-build app caddy
docker compose up -d --force-recreate --no-build app caddy
echo ">>> Образы emkaro-app:"
docker images emkaro-app --format 'table {{.Repository}}\t{{.Tag}}\t{{.CreatedSince}}' | head -6
echo "PREBUILT_IMAGE_OK"
