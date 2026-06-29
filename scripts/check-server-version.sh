#!/bin/bash
# Проверка версии на проде после деплоя
# Использование:
#   bash scripts/check-server-version.sh https://tstom.emkaro.ru
#   bash scripts/check-server-version.sh https://tstom.emkaro.ru <ожидаемый-коммит>
set -euo pipefail

BASE="${1:-https://tstom.emkaro.ru}"
EXPECTED_COMMIT="${2:-}"
echo ">>> $BASE/api/health"
json="$(curl -fsS "$BASE/api/health")"
echo "$json" | python3 -m json.tool 2>/dev/null || echo "$json"
echo ""
version="$(echo "$json" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("version",""))' 2>/dev/null || true)"
if [ -n "$version" ]; then
  echo "Version: $version"
fi
if [ -n "$EXPECTED_COMMIT" ]; then
  if echo "$version" | grep -q "$EXPECTED_COMMIT"; then
    echo "OK: commit $EXPECTED_COMMIT присутствует в version"
  else
    echo "ПРОБЛЕМА: commit $EXPECTED_COMMIT не найден в version."
    exit 1
  fi
fi
if echo "$json" | grep -q 'patientAppointmentSearch'; then
  echo "OK: новый bundle на проде"
else
  echo "ПРОБЛЕМА: version обновился, но bundle старый (нет patientAppointmentSearch)."
  echo "На сервере: cd /opt/emkaro && export DEPLOY_NO_CACHE=1 DEPLOY_VERSION=\"\$(cat .deploy-version)\" && docker compose build --no-cache app && docker compose up -d --force-recreate app"
  exit 1
fi
if echo "$json" | grep -q 'egiszCdaSnilsDigits'; then
  echo "OK: fix СНИЛС в CDA (egiszCdaSnilsDigits)"
else
  echo "ПРОБЛЕМА: bundle старый — нет egiszCdaSnilsDigits."
  exit 1
fi
if echo "$json" | grep -q 'egiszDocumentUuidAlign'; then
  echo "OK: UUID документа в CDA и N3 (egiszDocumentUuidAlign)"
else
  echo "ПРОБЛЕМА: bundle старый — нет egiszDocumentUuidAlign."
  exit 1
fi
