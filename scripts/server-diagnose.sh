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
echo "--- health route (first 5 lines) ---"
head -5 app/api/health/route.ts 2>/dev/null || echo "MISSING"

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
