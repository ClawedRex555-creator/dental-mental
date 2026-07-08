#!/bin/bash
# Резервная копия PostgreSQL (запускать на сервере из /opt/emkaro)
#
#   bash scripts/backup-db.sh
#   bash scripts/backup-db.sh /opt/emkaro pre-deploy
#
# Переменные:
#   BACKUP_KEEP_COUNT — сколько последних .sql оставить (по умолчанию 20)
set -euo pipefail

ROOT="${1:-/opt/emkaro}"
TAG="${2:-}"

cd "$ROOT"

if [ ! -f "docker-compose.yml" ]; then
  echo "Не найден docker-compose.yml в $ROOT"
  exit 1
fi

mkdir -p backups
STAMP=$(date +%Y%m%d-%H%M%S)
if [ -n "$TAG" ]; then
  OUT="backups/dentalcloud-${TAG}-${STAMP}.sql"
else
  OUT="backups/dentalcloud-${STAMP}.sql"
fi

echo ">>> Создаю бэкап: $OUT"
docker compose exec -T postgres pg_dump -U mis dentalcloud > "$OUT"
ls -lh "$OUT"

echo "$OUT" > backups/.last-backup
if [ "$TAG" = "pre-deploy" ]; then
  echo "$OUT" > backups/.last-pre-deploy-backup
fi

KEEP="${BACKUP_KEEP_COUNT:-20}"
mapfile -t OLD_BACKUPS < <(ls -1t backups/dentalcloud-*.sql 2>/dev/null | tail -n +$((KEEP + 1)) || true)
if [ "${#OLD_BACKUPS[@]}" -gt 0 ]; then
  echo ">>> Удаляю старые бэкапы (храним $KEEP последних)..."
  for f in "${OLD_BACKUPS[@]}"; do
    rm -f "$f"
  done
fi

echo ">>> Готово: $OUT"
echo ">>> Восстановление: bash scripts/restore-db-from-backup.sh $OUT"
