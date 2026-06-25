#!/bin/bash
# Проверка DNS для Docker Hub (на сервере)
#   bash scripts/server-check-dns.sh
set -euo pipefail

HOST="${1:-registry-1.docker.io}"

echo "=== DNS для Docker: $HOST ==="
echo ""

ok=0

if getent hosts "$HOST" >/dev/null 2>&1; then
  echo "OK: getent hosts $HOST"
  getent hosts "$HOST"
  ok=1
else
  echo "FAIL: getent hosts $HOST (часто 127.0.0.53 / systemd-resolved)"
fi

echo ""
if command -v dig >/dev/null 2>&1; then
  for ns in 8.8.8.8 1.1.1.1; do
    if dig +time=3 +tries=1 +short "$HOST" @"$ns" 2>/dev/null | grep -q .; then
      echo "OK: dig @$ns $HOST"
      dig +short "$HOST" @"$ns" | head -3
      ok=1
    else
      echo "FAIL: dig @$ns $HOST"
    fi
  done
else
  echo "(dig не установлен — apt install dnsutils)"
fi

echo ""
echo "--- Docker DNS ---"
if [ -f /etc/docker/daemon.json ]; then
  grep -E '"dns"' /etc/docker/daemon.json || echo "В daemon.json нет поля dns"
else
  echo "/etc/docker/daemon.json отсутствует"
fi

echo ""
echo "--- Локальный образ node:20-alpine ---"
if docker image inspect node:20-alpine >/dev/null 2>&1; then
  docker image inspect node:20-alpine --format 'ID={{.Id}} Created={{.Created}}'
else
  echo "Образ node:20-alpine не найден — без DNS pull не получится"
fi

echo ""
if [ "$ok" -eq 1 ]; then
  echo "Итог: DNS в целом доступен (возможна проблема только у systemd-resolved → настройте Docker DNS)"
  exit 0
fi

echo "Итог: DNS не работает — см. scripts/server-fix-docker-dns.sh"
exit 1
