#!/bin/bash
# Резервная копия PostgreSQL (запускать на сервере из /opt/emkaro)
set -euo pipefail

ROOT="${1:-/opt/emkaro}"
cd "$ROOT"

if [ ! -f "docker-compose.yml" ]; then
  echo "Не найден docker-compose.yml в $ROOT"
  exit 1
fi

mkdir -p backups
STAMP=$(date +%Y%m%d-%H%M%S)
OUT="backups/dentalcloud-${STAMP}.sql"

echo ">>> Создаю бэкап: $OUT"
docker compose exec -T postgres pg_dump -U mis dentalcloud > "$OUT"
ls -lh "$OUT"
echo ">>> Готово"
