#!/bin/bash
# Полное восстановление PostgreSQL из .sql (pg_dump plain).
# Пересоздаёт базу dentalcloud — текущие данные заменяются содержимым файла.
#
# На сервере:
#   cd /opt/emkaro
#   bash scripts/restore-db-from-backup.sh backups/dentalcloud-20260601-160907.sql
#
# Перед запуском: убедитесь, что выбран нужный файл (см. inspect-backup-patients.sh).
set -euo pipefail

ROOT="${DEPLOY_ROOT:-/opt/emkaro}"
DUMP="${1:-}"

if [ -z "$DUMP" ]; then
  echo "Укажите файл дампа:"
  echo "  bash scripts/restore-db-from-backup.sh backups/dentalcloud-20260601-160907.sql"
  exit 1
fi

if [ ! -f "$DUMP" ]; then
  echo "Файл не найден: $DUMP"
  exit 1
fi

cd "$ROOT"

if [ ! -f "docker-compose.yml" ]; then
  echo "docker-compose.yml не найден в $(pwd)"
  exit 1
fi

echo "=== Восстановление БД из: $DUMP ==="
echo "Текущая база dentalcloud будет УДАЛЕНА и создана заново."
read -r -p "Продолжить? Введите yes: " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Отменено."
  exit 0
fi

echo ">>> Страховочный дамп текущего состояния..."
bash scripts/backup-db.sh "$ROOT"

echo ">>> Останавливаем app (чтобы не держал соединения)..."
docker compose stop app 2>/dev/null || true

echo ">>> Закрываем сессии и пересоздаём базу..."
docker compose exec -T postgres psql -U mis -d postgres <<'SQL'
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'dentalcloud' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS dentalcloud;
CREATE DATABASE dentalcloud OWNER mis;
SQL

echo ">>> Загружаем дамп..."
docker compose exec -T postgres psql -U mis -d dentalcloud < "$DUMP"

echo ">>> Запускаем app..."
docker compose up -d app

echo ""
echo ">>> Проверка пациентов:"
docker compose exec -T postgres psql -U mis -d dentalcloud -c \
  "SELECT c.slug,
          COALESCE(jsonb_array_length(cs.data->'patients'), 0) AS patients,
          cs.updated_at
   FROM clinic_snapshots cs
   JOIN clinics c ON c.id = cs.clinic_id;"

echo ""
echo "Готово. Войдите в МИС и проверьте список пациентов."
