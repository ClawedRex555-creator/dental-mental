#!/bin/bash
# Рекомендации и (опционально) правка DNS для Docker на VPS
# Запуск на сервере: bash scripts/server-fix-docker-dns.sh
# С флагом --apply — прописать 8.8.8.8 / 1.1.1.1 в /etc/docker/daemon.json
set -euo pipefail

APPLY=0
if [ "${1:-}" = "--apply" ]; then
  APPLY=1
fi

echo "=== Исправление DNS для Docker Hub ==="
echo ""

if [ "$APPLY" -eq 1 ]; then
  if [ "$(id -u)" -ne 0 ]; then
    echo "Для --apply нужен root: sudo bash $0 --apply"
    exit 1
  fi

  DAEMON_JSON=/etc/docker/daemon.json
  if [ -f "$DAEMON_JSON" ]; then
    cp "$DAEMON_JSON" "${DAEMON_JSON}.bak.$(date +%Y%m%d%H%M%S)"
  fi

  python3 - <<'PY'
import json
from pathlib import Path

path = Path("/etc/docker/daemon.json")
data = {}
if path.exists():
    data = json.loads(path.read_text() or "{}")
data["dns"] = ["8.8.8.8", "1.1.1.1"]
path.write_text(json.dumps(data, indent=2) + "\n")
print("Записано:", path)
PY

  systemctl restart docker
  echo "Docker перезапущен."
  echo ""
fi

echo "1) Проверка:"
echo "   bash scripts/server-check-dns.sh"
echo ""
echo "2) Если getent падает, а dig @8.8.8.8 работает — примените DNS для Docker:"
echo "   sudo bash scripts/server-fix-docker-dns.sh --apply"
echo ""
echo "3) Или поправьте systemd-resolved (/etc/systemd/resolved.conf):"
echo "   DNS=8.8.8.8 1.1.1.1"
echo "   sudo systemctl restart systemd-resolved"
echo ""
echo "4) Затем:"
echo "   docker pull node:20-alpine"
echo "   cd /opt/emkaro && DEPLOY_NO_CACHE=1 bash scripts/server-update.sh /opt/emkaro-update.tar.gz"
echo ""
echo "5) Временный обход (образ уже скачан, DNS всё ещё плохой):"
echo "   DEPLOY_NO_CACHE=0 bash scripts/server-update.sh /opt/emkaro-update.tar.gz"
echo "   (риск старого bundle — после починки DNS лучше пересобрать с DEPLOY_NO_CACHE=1)"
