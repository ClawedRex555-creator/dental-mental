#!/bin/bash
# Чеклист наблюдения прода (начало рабочей недели). Только чтение.
#   bash scripts/prod-observe-checklist.sh
#   bash scripts/prod-observe-checklist.sh https://tstom.emkaro.ru
set -euo pipefail

BASES=(
  "${1:-https://tstom.emkaro.ru}"
  "https://demo.emkaro.ru"
  "https://elanar.emkaro.ru"
)

echo "=== Emkaro prod observe (docs/PROD-SAFETY.md) ==="
echo ""

for base in "${BASES[@]}"; do
  echo ">>> $base/api/health"
  if ! json="$(curl -fsS --max-time 15 "$base/api/health")"; then
    echo "FAIL: health недоступен"
    exit 1
  fi
  echo "$json" | python3 -m json.tool 2>/dev/null || echo "$json"
  ok="$(echo "$json" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("ok"))' 2>/dev/null || true)"
  db="$(echo "$json" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("database"))' 2>/dev/null || true)"
  ver="$(echo "$json" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("version",""))' 2>/dev/null || true)"
  if [ "$ok" != "True" ] && [ "$ok" != "true" ]; then
    echo "FAIL: ok != true"
    exit 1
  fi
  if [ "$db" != "True" ] && [ "$db" != "true" ]; then
    echo "FAIL: database != true"
    exit 1
  fi
  echo "OK: version=$ver"
  echo ""
done

echo "На сервере дополнительно:"
echo "  ls -lht /opt/emkaro/backups/*.sql | head"
echo "  cat /opt/emkaro/backups/.last-pre-deploy-backup"
echo "  systemctl list-timers emkaro-backup.timer --all   # если установлен"
echo ""
echo "Ручной smoke после инцидента/деплоя:"
echo "  owner/admin: телефон пациента виден"
echo "  doctor: телефон скрыт в UI"
echo "  расписание: открыть/сохранить запись"
echo "  карточка пациента + «К списку»"
echo ""
echo "Готово (observe-only, без изменений БД)."
