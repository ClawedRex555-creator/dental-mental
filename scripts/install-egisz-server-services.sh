#!/bin/bash
# Автозапуск на сервере: N3 OpenVPN + проброс порта подписи для Docker
# Запуск на сервере: bash scripts/install-egisz-server-services.sh
set -euo pipefail

ROOT="${DEPLOY_ROOT:-/opt/emkaro}"
cd "$ROOT"

echo "=== Emkaro: службы ЕГИСЗ на сервере ==="

if ! command -v socat >/dev/null 2>&1; then
  echo ">>> Установка socat..."
  apt-get update -qq
  apt-get install -y socat
fi

BIND_HOST="${SIGNING_BIND_HOST:-172.17.0.1}"
PORT="${SIGNING_PORT:-9876}"

cat > /etc/systemd/system/emkaro-signing-forward.service <<EOF
[Unit]
Description=Emkaro signing port forward (Docker -> SSH tunnel from clinic PC)
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/socat TCP-LISTEN:${PORT},bind=${BIND_HOST},fork,reuseaddr TCP:127.0.0.1:${PORT}
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/emkaro-n3-vpn.service <<EOF
[Unit]
Description=Emkaro N3 OpenVPN (test contour b2b-demo)
After=network-online.target
Wants=network-online.target

[Service]
Type=forking
WorkingDirectory=${ROOT}
ExecStart=/bin/bash ${ROOT}/scripts/n3-vpn.sh start
ExecStop=/bin/bash ${ROOT}/scripts/n3-vpn.sh stop
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable emkaro-signing-forward.service
systemctl enable emkaro-n3-vpn.service
systemctl restart emkaro-signing-forward.service
systemctl start emkaro-n3-vpn.service || true

echo ""
echo ">>> Статус проброса подписи:"
systemctl --no-pager status emkaro-signing-forward.service | head -5 || true
echo ""
echo ">>> Статус N3 VPN:"
bash scripts/n3-vpn.sh status || true
echo ""
echo "Проверка (после поднятия туннеля с Windows):"
echo "  curl -s http://${BIND_HOST}:${PORT}/health"
echo "  bash scripts/n3-vpn.sh test"
echo ""
echo "В .env должно быть:"
echo "  EGISZ_SIGNING_URL=http://${BIND_HOST}:${PORT}/sign"
