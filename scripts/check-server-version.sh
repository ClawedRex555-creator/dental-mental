#!/bin/bash
# Проверка версии на проде после деплоя
# Использование: bash scripts/check-server-version.sh https://tstom.emkaro.ru
set -euo pipefail

BASE="${1:-https://tstom.emkaro.ru}"
echo ">>> $BASE/api/health"
curl -fsS "$BASE/api/health" | python3 -m json.tool 2>/dev/null || curl -fsS "$BASE/api/health"
echo ""
echo "Ожидается: features.doctorServicesCatalog=true и version с коммитом main"
