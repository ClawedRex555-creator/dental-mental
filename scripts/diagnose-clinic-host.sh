#!/usr/bin/env bash
# Диагностика поддомена клиники на сервере.
#   bash scripts/diagnose-clinic-host.sh elanar
set -euo pipefail
SLUG="${1:-elanar}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

DOMAIN="${APP_ROOT_DOMAIN:-emkaro.ru}"
HOST="${SLUG}.${DOMAIN}"

echo "=== Диагностика ${HOST} ==="
echo "APP_ROOT_DOMAIN=${DOMAIN}"
echo ""

echo "--- DNS (с сервера) ---"
if command -v dig >/dev/null 2>&1; then
  dig +short "$HOST" || true
  dig +short "$DOMAIN" || true
else
  echo "(dig не установлен)"
fi
echo ""

echo "--- Caddyfile в контейнере ---"
docker compose exec -T caddy grep -E 'elanar|tstom|\*\.' /etc/caddy/Caddyfile 2>/dev/null || echo "caddy недоступен"
echo ""

echo "--- APP_ROOT_DOMAIN в caddy ---"
docker compose exec -T caddy sh -c 'echo "APP_ROOT_DOMAIN=$APP_ROOT_DOMAIN"' 2>/dev/null || true
echo ""

echo "--- HTTP / HTTPS локально ---"
curl -sS -o /dev/null -w "HTTP  %{http_code}  %{time_total}s\n" --connect-timeout 5 "http://${HOST}/api/health" 2>&1 || echo "HTTP failed"
curl -sSk -o /dev/null -w "HTTPS %{http_code}  %{time_total}s\n" --connect-timeout 10 "https://${HOST}/api/health" 2>&1 || echo "HTTPS failed"
echo ""

echo "--- app из сети docker ---"
docker compose exec -T caddy wget -qO- --timeout=5 "http://app:3000/api/health" 2>/dev/null || echo "app:3000 недоступен"
echo ""

echo "--- клиника в БД ---"
docker compose exec -T app node -e "
const pg=require('pg');
const c=new pg.Client({connectionString:process.env.DATABASE_URL});
c.connect().then(()=>c.query('SELECT slug,name FROM clinics WHERE slug=\$1',['${SLUG}']))
 .then(r=>{console.log(r.rows[0]||'НЕ НАЙДЕНА');return c.end();})
 .catch(e=>{console.error(e.message);process.exit(1);});
" 2>/dev/null || echo "(проверка БД не удалась)"
echo ""

echo "--- последние логи caddy ---"
docker compose logs caddy --tail 25 2>/dev/null || true
