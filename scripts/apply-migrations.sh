#!/bin/bash
# Применяет db/migrations/*.sql через psql (надёжнее node-pg на проде).
# Запуск на сервере из каталога проекта:
#   cd /opt/emkaro && bash scripts/apply-migrations.sh
#
# Одна миграция:
#   bash scripts/apply-migrations.sh 005-auth-login-global-unique.sql
set -euo pipefail

ROOT="${DEPLOY_ROOT:-/opt/emkaro}"
cd "$ROOT"

if [ ! -f docker-compose.yml ]; then
  echo "docker-compose.yml не найден в $ROOT"
  exit 1
fi

PSQL=(docker compose exec -T postgres psql -U mis -d dentalcloud -v ON_ERROR_STOP=1)

"${PSQL[@]}" -c "
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"

apply_one() {
  local file="$1"
  local base
  base="$(basename "$file")"

  local applied
  applied="$("${PSQL[@]}" -tAc "SELECT 1 FROM schema_migrations WHERE filename = '${base}'" | tr -d '[:space:]')"
  if [ "$applied" = "1" ]; then
    echo "⊘ skip $base (уже применена)"
    return 0
  fi

  echo ">>> apply $base"
  "${PSQL[@]}" -f - < "$file"
  "${PSQL[@]}" -c "INSERT INTO schema_migrations (filename) VALUES ('${base}')"
  echo "✓ $base"
}

if [ $# -ge 1 ]; then
  for name in "$@"; do
    file="db/migrations/$name"
    if [ ! -f "$file" ]; then
      file="$name"
    fi
    if [ ! -f "$file" ]; then
      echo "Файл не найден: $name"
      exit 1
    fi
    apply_one "$file"
  done
else
  shopt -s nullglob
  files=(db/migrations/*.sql)
  if [ ${#files[@]} -eq 0 ]; then
    echo "Нет файлов в db/migrations/"
    exit 1
  fi
  for file in "${files[@]}"; do
    apply_one "$file"
  done
fi

echo "Миграции применены."
