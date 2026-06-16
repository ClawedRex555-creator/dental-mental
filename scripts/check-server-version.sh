#!/bin/bash
# Проверка версии на проде после деплоя
# Использование: bash scripts/check-server-version.sh https://tstom.emkaro.ru
set -euo pipefail

BASE="${1:-https://tstom.emkaro.ru}"
echo ">>> $BASE/api/health"
json="$(curl -fsS "$BASE/api/health")"
echo "$json" | python3 -m json.tool 2>/dev/null || echo "$json"
echo ""
if echo "$json" | grep -q 'patientAppointmentSearch'; then
  echo "OK: новый bundle на проде"
else
  echo "ПРОБЛЕМА: version обновился, но bundle старый (нет patientAppointmentSearch)."
  echo "На сервере: cd /opt/emkaro && export DEPLOY_NO_CACHE=1 DEPLOY_VERSION=\"\$(cat .deploy-version)\" && docker compose build --no-cache app && docker compose up -d --force-recreate app"
  exit 1
fi
