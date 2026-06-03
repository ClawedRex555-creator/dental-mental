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
