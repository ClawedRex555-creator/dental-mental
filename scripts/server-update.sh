#!/bin/bash
# Безопасное обновление на сервере: бэкап БД → распаковка → пересборка
# Использование (на сервере):
#   bash scripts/server-update.sh
#   bash scripts/server-update.sh /opt/emkaro-update.tar.gz
#   DEPLOY_USE_PREBUILT=1 bash scripts/server-update.sh   # npm в Docker не тянет registry
set -euo pipefail

ROOT="${DEPLOY_ROOT:-/opt/emkaro}"
ARCHIVE="${1:-/opt/emkaro-update.tar.gz}"

cd "$ROOT"

if [ ! -f "docker-compose.yml" ]; then
  echo "Запустите из каталога проекта (docker-compose.yml не найден в $ROOT)"
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
  else
    echo "ПРЕДУПРЕЖДЕНИЕ: python3 не найден — базовая проверка .env"
    if grep -qE 'APP_ROOT_DOMAIN=.*\.u$' "$env_file" || grep -qE 'ACME_EMAIL=.*\.u$' "$env_file"; then
      echo "ОШИБКА: .env повреждён (домен обрезан до .u вместо .ru). Установите python3 и fix-server-env.py"
      exit 1
    fi
  fi
}

fix_deploy_scripts_crlf() {
  if [ -d "$ROOT/scripts" ]; then
    # shellcheck disable=SC2044
    while IFS= read -r -d '' f; do
      sed -i 's/\r$//' "$f" 2>/dev/null || true
    done < <(find "$ROOT/scripts" -maxdepth 1 -name '*.sh' -print0 2>/dev/null || true)
  fi
}

echo "=== Emkaro: безопасное обновление ==="

normalize_and_validate_env

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi
missing_env=()
for key in AUTH_SECRET APP_ROOT_DOMAIN POSTGRES_PASSWORD PHI_ENCRYPTION_KEY; do
  eval "val=\${$key:-}"
  if [ -z "$val" ]; then
    missing_env+=("$key")
  fi
done
if [ "${#missing_env[@]}" -gt 0 ]; then
  echo "ОШИБКА: в .env не заданы: ${missing_env[*]}"
  echo "Добавьте в /opt/emkaro/.env (сгенерировать: openssl rand -base64 48):"
  echo "  PHI_ENCRYPTION_KEY=<случайная строка>"
  echo "Без этого docker compose не пересоберёт app — останется старый контейнер."
  exit 1
fi

echo ">>> Бэкап PostgreSQL..."
bash scripts/backup-db.sh "$ROOT"

if [ -f "$ARCHIVE" ]; then
  echo ">>> Сохраняю .env и распаковываю $ARCHIVE ..."
  cp .env /tmp/emkaro.env.bak
  tar -xzf "$ARCHIVE" -C "$ROOT"
  cp /tmp/emkaro.env.bak .env
  fix_deploy_scripts_crlf
  normalize_and_validate_env

  bash scripts/fix-stale-routes.sh "$ROOT"
  if [ -f "$ROOT/.deploy-version" ]; then
    echo ">>> Версия деплоя: $(cat "$ROOT/.deploy-version")"
  fi
  if ! grep -q 'normalizeSnilsDigits' "$ROOT/lib/egisz/cda/builder.ts" 2>/dev/null; then
    echo "ПРЕДУПРЕЖДЕНИЕ: lib/egisz/cda/builder.ts без normalizeSnilsDigits — AddMedRecord N3 может падать на СНИЛС"
  fi
  if ! grep -q 'doctor' "$ROOT/lib/constants.ts" 2>/dev/null || \
     ! grep -q '/warehouse' "$ROOT/lib/constants.ts" 2>/dev/null; then
    echo "ПРЕДУПРЕЖДЕНИЕ: lib/constants.ts на сервере без доступа врача к Услугам — задеплойте свежий код с Mac"
  fi
else
  echo ">>> Архив $ARCHIVE не найден — только пересборка контейнеров"
  bash scripts/fix-stale-routes.sh "$ROOT"
fi

echo ">>> Пересборка (данные в volume pg-data не трогаются)..."
if [ -f "$ROOT/.deploy-version" ]; then
  export DEPLOY_VERSION="$(tr -d '\r' < "$ROOT/.deploy-version")"
else
  export DEPLOY_VERSION="unknown"
fi

if [ "${DEPLOY_USE_PREBUILT:-0}" = "1" ]; then
  echo ">>> DEPLOY_USE_PREBUILT=1 — host npm build + Dockerfile.prebuilt"
  bash scripts/server-build-prebuilt.sh
elif ! getent hosts registry-1.docker.io >/dev/null 2>&1; then
  echo ""
  echo "ПРЕДУПРЕЖДЕНИЕ: DNS на сервере не резолвит registry-1.docker.io (Docker Hub)."
  echo "  lookup через 127.0.0.53: server misbehaving — типичная проблема systemd-resolved на VPS."
  echo ""
  bash "$ROOT/scripts/server-check-dns.sh" || true
  echo ""
  if docker image inspect node:20-alpine >/dev/null 2>&1; then
    echo ">>> Образ node:20-alpine есть локально — сборка без Docker Hub (prebuilt path)"
    bash scripts/server-build-prebuilt.sh
  elif [ "${DEPLOY_NO_CACHE:-1}" = "0" ]; then
    echo ">>> DEPLOY_NO_CACHE=0 — пробуем docker compose up --build с кэшем..."
    docker compose up -d --build
  else
    echo "ОШИБКА: нет локального node:20-alpine и Docker Hub недоступен."
    echo ""
    echo "Починка DNS: sudo bash scripts/server-fix-docker-dns.sh --apply"
    echo "Затем: DEPLOY_NO_CACHE=1 bash scripts/server-update.sh ${ARCHIVE:-}"
    echo ""
    echo "Или вручную: DEPLOY_USE_PREBUILT=1 bash scripts/server-update.sh ${ARCHIVE:-}"
    exit 1
  fi
elif [ "${DEPLOY_NO_CACHE:-1}" = "1" ]; then
  echo ">>> docker compose build --no-cache app (DEPLOY_NO_CACHE=1)"
  if ! docker compose build --no-cache app; then
    echo "ПРЕДУПРЕЖДЕНИЕ: docker compose build не удался — пробуем prebuilt path..."
    bash scripts/server-build-prebuilt.sh
  else
    docker compose up -d --force-recreate app caddy
  fi
else
  docker compose up -d --build
fi

echo ">>> Статус:"
docker compose ps

echo ">>> Проверка bundle внутри контейнера..."
health_json="$(docker compose exec -T app node -e "
fetch('http://127.0.0.1:3000/api/health').then(r=>r.json()).then(j=>console.log(JSON.stringify(j))).catch(e=>{console.error(e);process.exit(1)})
" 2>/dev/null || echo '{}')"

if echo "$health_json" | grep -q 'patientAppointmentSearch'; then
  echo "OK: новый bundle (patientAppointmentSearch в /api/health)"
  if echo "$health_json" | grep -q 'egiszDocumentUuidAlign'; then
    echo "OK: UUID документа в CDA и N3 (egiszDocumentUuidAlign)"
  else
    echo "ОШИБКА: нет egiszDocumentUuidAlign в /api/health — контейнер со старым bundle."
    echo "Ответ: $health_json"
    if grep -q 'egiszDocumentUuidAlign' "$ROOT/app/api/health/route.ts" 2>/dev/null; then
      echo "На диске код новый — пересоберите: DEPLOY_NO_CACHE=1 docker compose build --no-cache app && docker compose up -d --force-recreate app"
    else
      echo "На диске код старый — задеплойте свежий tar с Mac: bash scripts/deploy-to-server.sh"
    fi
    exit 1
  fi
  if echo "$health_json" | grep -q 'egiszCdaSnilsDigits'; then
    echo "OK: fix СНИЛС в CDA (egiszCdaSnilsDigits)"
  else
    echo "ПРЕДУПРЕЖДЕНИЕ: нет egiszCdaSnilsDigits в /api/health — пересоберите app без кэша"
  fi
else
  echo "ОШИБКА: контейнер со старым Next.js bundle."
  echo "Ответ /api/health: $health_json"
  if grep -q 'patientAppointmentSearch' "$ROOT/app/api/health/route.ts" 2>/dev/null; then
    echo "На диске код новый — пересоберите: DEPLOY_NO_CACHE=1 docker compose build --no-cache app && docker compose up -d --force-recreate app"
  else
    echo "На диске код старый — задеплойте свежий tar с Mac: bash scripts/deploy-to-server.sh"
  fi
  exit 1
fi

echo ""
echo "============================================"
echo "  Готово. Бэкап в $ROOT/backups/"
echo "  НЕ используйте: docker compose down -v"
echo "============================================"
