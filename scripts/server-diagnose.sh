#!/bin/bash
# Диагностика на сервере: bash scripts/server-diagnose.sh
set -euo pipefail
ROOT="${DEPLOY_ROOT:-/opt/emkaro}"
cd "$ROOT"

echo "=== Emkaro server diagnose ==="
echo "Host: $(hostname)"
echo ""

echo "--- constants.ts (warehouse roles) ---"
grep '/warehouse' lib/constants.ts || echo "NOT FOUND"

echo ""
echo "--- новые фичи на диске ---"
if [ -f components/shared/patient-search-select.tsx ]; then
  echo "patient-search-select.tsx: OK"
else
  echo "patient-search-select.tsx: MISSING (нужен деплой с Mac)"
fi
if grep -q canAccessTreatmentPlansCatalog lib/rbac.ts 2>/dev/null; then
  echo "canAccessTreatmentPlansCatalog: OK"
else
  echo "canAccessTreatmentPlansCatalog: MISSING"
fi

echo ""
echo "--- .env (обязательные ключи) ---"
for key in AUTH_SECRET PHI_ENCRYPTION_KEY APP_ROOT_DOMAIN; do
  if grep -q "^${key}=" .env 2>/dev/null && [ -n "$(grep "^${key}=" .env | cut -d= -f2- | tr -d ' \"')" ]; then
    echo "$key: set"
  else
    echo "$key: MISSING — пересборка app не запустится"
  fi
done

echo ""
echo "--- health route (features block) ---"
grep -A6 'const features' app/api/health/route.ts 2>/dev/null || echo "MISSING"

echo ""
echo "--- .deploy-version ---"
cat .deploy-version 2>/dev/null || echo "MISSING (старый деплой)"

echo ""
echo "--- docker ---"
docker compose ps 2>/dev/null || docker-compose ps

echo ""
echo "--- /api/health from inside container ---"
docker compose exec -T app node -e "
fetch('http://127.0.0.1:3000/api/health').then(r=>r.json()).then(j=>console.log(JSON.stringify(j,null,2))).catch(e=>console.error(e))
" 2>/dev/null || echo "exec failed"
