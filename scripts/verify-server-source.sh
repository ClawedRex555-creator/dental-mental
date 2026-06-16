#!/bin/bash
# На сервере: bash scripts/verify-server-source.sh
set -euo pipefail
cd "${DEPLOY_ROOT:-/opt/emkaro}"

echo "=== verify-server-source ==="
echo "deploy-version: $(cat .deploy-version 2>/dev/null || echo MISSING)"
echo ""

ok=1
if grep -q 'patientAppointmentSearch' app/api/health/route.ts 2>/dev/null; then
  echo "health route: OK (patientAppointmentSearch)"
else
  echo "health route: STALE — нет patientAppointmentSearch в app/api/health/route.ts"
  ok=0
fi

if [ -f components/shared/patient-search-select.tsx ]; then
  echo "patient-search-select.tsx: OK"
else
  echo "patient-search-select.tsx: MISSING"
  ok=0
fi

if grep -q 'canAccessTreatmentPlansCatalog' lib/rbac.ts 2>/dev/null; then
  echo "rbac treatment plans: OK"
else
  echo "rbac: STALE"
  ok=0
fi

echo ""
if [ "$ok" = 1 ]; then
  echo "Исходники на диске свежие. Если /api/health старый — docker compose build --no-cache app"
else
  echo "Нужен деплой с Mac: bash scripts/deploy-to-server.sh"
  exit 1
fi
