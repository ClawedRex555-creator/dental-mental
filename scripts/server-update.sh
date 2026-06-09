#!/bin/bash
# Безопасное обновление на сервере: бэкап БД → распаковка → пересборка
# Использование (на сервере):
#   bash scripts/server-update.sh
#   bash scripts/server-update.sh /opt/emkaro-update.tar.gz
set -euo pipefail

ROOT="${DEPLOY_ROOT:-/opt/emkaro}"
ARCHIVE="${1:-/opt/emkaro-update.tar.gz}"

cd "$ROOT"

if [ ! -f "docker-compose.yml" ]; then
  echo "Запустите из каталога проекта (docker-compose.yml не найден в $ROOT)"
  exit 1
fi

echo "=== Emkaro: безопасное обновление ==="

echo ">>> Бэкап PostgreSQL..."
bash scripts/backup-db.sh "$ROOT"

if [ -f "$ARCHIVE" ]; then
  echo ">>> Сохраняю .env и распаковываю $ARCHIVE ..."
  cp .env /tmp/emkaro.env.bak
  tar -xzf "$ARCHIVE" -C "$ROOT"
  cp /tmp/emkaro.env.bak .env
  sed -i 's/\r$//' .env 2>/dev/null || true

  # После переноса страниц в app/(dashboard)/(modules)/ старые каталоги в tar не удаляются — дубликаты ломают next build
  DASH="app/(dashboard)"
  for dir in appointments patients medical-records treatment-plans finance dashboard reports staff legal online-booking my-salary; do
    if [ -d "$ROOT/$DASH/$dir" ] && [ -d "$ROOT/$DASH/(modules)/$dir" ]; then
      echo ">>> Удаляю устаревший маршрут $DASH/$dir (есть (modules)/$dir)"
      rm -rf "$ROOT/$DASH/$dir"
    fi
  done
  if [ -d "$ROOT/$DASH/(modules)/warehouse" ]; then
    echo ">>> Удаляю устаревший маршрут $DASH/(modules)/warehouse"
    rm -rf "$ROOT/$DASH/(modules)/warehouse"
  fi
  if [ -f "$ROOT/.deploy-version" ]; then
    echo ">>> Версия деплоя: $(cat "$ROOT/.deploy-version")"
  fi
  if ! grep -q 'doctor' "$ROOT/lib/constants.ts" 2>/dev/null || \
     ! grep -q '/warehouse' "$ROOT/lib/constants.ts" 2>/dev/null; then
    echo "ПРЕДУПРЕЖДЕНИЕ: lib/constants.ts на сервере без доступа врача к Услугам — задеплойте свежий код с Mac"
  fi
else
  echo ">>> Архив $ARCHIVE не найден — только пересборка контейнеров"
fi

echo ">>> Пересборка (данные в volume pg-data не трогаются)..."
docker compose up -d --build

echo ">>> Статус:"
docker compose ps

echo ""
echo "============================================"
echo "  Готово. Бэкап в $ROOT/backups/"
echo "  НЕ используйте: docker compose down -v"
echo "============================================"
