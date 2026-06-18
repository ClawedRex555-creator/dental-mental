#!/bin/bash
# Проверка готовности тестового контура ЕГИСЗ / N3
#
# На сервере:
#   cd /opt/emkaro && bash scripts/egisz-test-contour.sh
#
# С Mac (только health):
#   bash scripts/egisz-test-contour.sh https://tstom.emkaro.ru
#
set -euo pipefail

ROOT="${DEPLOY_ROOT:-/opt/emkaro}"
BASE="${1:-https://tstom.emkaro.ru}"

echo "=== Emkaro: тестовый контур ЕГИСЗ ==="
echo ""

echo ">>> 1. Health $BASE"
if curl -fsS "$BASE/api/health" | python3 -m json.tool; then
  echo "OK"
else
  echo "ОШИБКА: клиника недоступна"
  exit 1
fi
echo ""

if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env"
  set +a
  echo ">>> 2. Переменные на сервере"
  for key in PHI_ENCRYPTION_KEY EGISZ_CRON_SECRET EGISZ_GATEWAY_URL; do
    eval "v=\${$key:-}"
    [ -n "$v" ] && echo "$key=OK" || echo "$key=не задан"
  done
  echo ""
  echo ">>> 3. Cron /api/egisz/process"
  if [ -n "${EGISZ_CRON_SECRET:-}" ]; then
    code="$(curl -sS -o /tmp/egisz-process.json -w '%{http_code}' \
      -H "Authorization: Bearer $EGISZ_CRON_SECRET" \
      "$BASE/api/egisz/process")"
    echo "HTTP $code"
    cat /tmp/egisz-process.json
    echo ""
  else
    echo "Пропуск: задайте EGISZ_CRON_SECRET в .env"
    echo "  echo \"EGISZ_CRON_SECRET=\$(openssl rand -hex 24)\" >> .env"
    echo "  docker compose up -d --force-recreate app"
  fi
  echo ""
fi

cat <<'EOF'
>>> 4. В UI (https://tstom.emkaro.ru)

A) Stub (без VPN и без SOAP) — проверка очереди:
   • platform/admin → модуль «ЕГИСЗ» включён для tstom
   • Настройки → N3 / ЕГИСЗ:
     - Включить интеграцию
     - Подключение: Stub
     - Контур: Тестовый
     - Подпись: Stub
   • Пациент: СНИЛС заполнен
   • Врач: СНИЛС, OID ФРМР, код должности
   • Медкарта с диагнозом → «Обработать очередь»
   • Ожидание: статус sent, STUB-PAT-* / STUB-DOC-*

B) Live тест N3 demo (реальный SOAP):
   • OpenVPN .ovpn из ЛК N3 на сервере (openvpn --config …)
   • Настройки → N3 / ЕГИСЗ:
     - Подключение: Live
     - Контур: Тестовый
     - URL: http://b2b-demo.n3health.ru/emk/EMKService.svc
     - OID организации, GUID, idLPU, login, password из ЛК N3
   • missingForLive в статусе должен быть пустым
   • Медкарта → Обработать очередь

>>> 5. Статус интеграции (нужна сессия владельца):
   curl -s "$BASE/api/egisz/status" -b "dc_session=..."

EOF
