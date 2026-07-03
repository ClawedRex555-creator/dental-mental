#!/bin/bash
# Открыть справочники N3 в браузере с Mac/Windows БЕЗ своего OpenVPN.
# Трафик идёт: ваш ПК → SSH → сервер Emkaro (там уже N3 VPN) → b2b-demo.n3health.ru
#
# 1) Запустите этот скрипт (окно не закрывайте):
#      bash scripts/nsi-browser-tunnel.sh
# 2) В браузере откройте (примите предупреждение о сертификате):
#      https://127.0.0.1:18443/nsiui/Dictionary/1.2.643.2.69.1.1.1.195
#
# ВАЖНО: не подключайте тот же .ovpn на Mac/Windows — N3 разрешает одну сессию,
# серверный VPN отвалится (AUTH_FAILED).
set -euo pipefail

SERVER="${1:-root@201.51.0.171}"
LOCAL_PORT="${NSI_LOCAL_PORT:-18443}"
REMOTE_HOST="${N3_DEMO_HOST:-b2b-demo.n3health.ru}"
REMOTE_PORT="${N3_DEMO_HTTPS_PORT:-443}"
OID="${2:-1.2.643.2.69.1.1.1.195}"

echo ">>> SSH-туннель: localhost:${LOCAL_PORT} -> ${REMOTE_HOST}:${REMOTE_PORT} через ${SERVER}"
echo ">>> Проверка VPN на сервере..."
ssh -o ConnectTimeout=20 "$SERVER" "bash /opt/emkaro/scripts/n3-vpn.sh status | head -6"

echo ""
echo "Откройте в браузере (сертификат N3 самоподписанный — это нормально):"
echo "  https://127.0.0.1:${LOCAL_PORT}/nsiui/Dictionary/${OID}"
echo ""
echo "Экспорт JSON/XML: https://127.0.0.1:${LOCAL_PORT}/nsiimportexport"
echo "Для экспорта нужен логин НСИ из ЛК N3."
echo ""
echo "Ctrl+C — закрыть туннель."
exec ssh -N \
  -o ServerAliveInterval=15 \
  -o ServerAliveCountMax=3 \
  -L "${LOCAL_PORT}:${REMOTE_HOST}:${REMOTE_PORT}" \
  "$SERVER"
