#!/bin/bash
# Обновление на сервере: бэкап → распаковка → docker image из .next/standalone → restart.
#   bash scripts/server-update.sh /opt/emkaro-update.tar.gz
set -euo pipefail

ROOT="${DEPLOY_ROOT:-/opt/emkaro}"
ARCHIVE="${1:-/opt/emkaro-update.tar.gz}"

cd "$ROOT"

if [ ! -f "docker-compose.yml" ]; then
  echo "ОШИБКА: docker-compose.yml не найден в $ROOT"
  exit 1
fi

normalize_and_validate_env() {
  local env_file="$ROOT/.env"
  if [ ! -f "$env_file" ]; then
    echo "ОШИБКА: нет $env_file"
    exit 1
  fi
  sed -i 's/\r$//' "$env_file" 2>/dev/null || true
  if command -v python3 >/dev/null 2>&1; then
    python3 scripts/fix-server-env.py "$env_file"
    python3 scripts/fix-server-env.py --check "$env_file"
  fi
}

has_mac_bundle() {
  [ -f "$ROOT/.deploy-next-bundle" ] && [ -d "$ROOT/.next/standalone" ] && [ -d "$ROOT/.next/static" ]
}

echo "=== Emkaro: обновление ==="

echo ">>> Бэкап PostgreSQL..."
bash scripts/backup-db.sh "$ROOT"

if [ -f "$ARCHIVE" ]; then
  echo ">>> Распаковка $ARCHIVE ..."
  cp .env /tmp/emkaro.env.bak
  tar -xzf "$ARCHIVE" -C "$ROOT"
  cp /tmp/emkaro.env.bak .env
  normalize_and_validate_env
  bash scripts/fix-stale-routes.sh "$ROOT"
  if [ -f "$ROOT/.deploy-version" ]; then
    echo ">>> Версия: $(cat "$ROOT/.deploy-version")"
  fi
else
  echo "ОШИБКА: архив $ARCHIVE не найден"
  exit 1
fi

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi
for key in AUTH_SECRET APP_ROOT_DOMAIN POSTGRES_PASSWORD PHI_ENCRYPTION_KEY; do
  eval "val=\${$key:-}"
  if [ -z "$val" ]; then
    echo "ОШИБКА: в .env не задан $key"
    exit 1
  fi
done

if [ -f "$ROOT/.deploy-version" ]; then
  export DEPLOY_VERSION="$(tr -d '\r' < "$ROOT/.deploy-version")"
else
  export DEPLOY_VERSION="unknown"
fi

has_mac_bundle || {
  echo "ОШИБКА: в архиве нет .next/standalone."
  echo "  С Mac: bash scripts/deploy-to-server.sh"
  exit 1
}

echo ">>> Docker image из .next/standalone (~1 мин)..."
bash scripts/server-docker-prebuilt-image.sh

echo ">>> Статус:"
docker compose ps

fetch_app_health() {
  docker compose exec -T app node -e "
    fetch('http://127.0.0.1:3000/api/health')
      .then((r) => r.text())
      .then((t) => process.stdout.write(t))
      .catch(() => process.exit(1));
  " 2>/dev/null || echo '{}'
}

if docker compose ps app 2>/dev/null | grep -qE 'Restarting|Exit'; then
  echo "ОШИБКА: контейнер app не запущен (crash loop или exit)."
  if [ -f "$ROOT/.deploy-next-bundle" ]; then
    echo ">>> Bundle:"
    cat "$ROOT/.deploy-next-bundle"
  fi
  echo ">>> uname на сервере: $(uname -m)"
  echo ">>> Логи app:"
  docker compose logs app --tail 100 || true
  exit 1
fi

health="{}"
health_ok=0
for _ in $(seq 1 30); do
  health="$(fetch_app_health)"
  if echo "$health" | grep -q 'patientAppointmentSearch'; then
    health_ok=1
    break
  fi
  if docker compose ps app 2>/dev/null | grep -qE 'Restarting|Exit'; then
    break
  fi
  sleep 2
done

if [ "$health_ok" = 1 ]; then
  echo "OK: новый bundle"
  echo ">>> /api/health: $health"
  echo "Готово. Бэкап: $ROOT/backups/"
  exit 0
fi

echo "ОШИБКА: /api/health не отвечает или старый bundle."
echo ">>> /api/health: $health"
if [ -f "$ROOT/.deploy-next-bundle" ]; then
  echo ">>> Bundle:"
  cat "$ROOT/.deploy-next-bundle"
fi
echo ">>> uname на сервере: $(uname -m)"
echo ">>> Логи app:"
docker compose logs app --tail 100 || true
exit 1
