#!/bin/bash
# N3 OpenVPN на сервере Emkaro (тестовый контур b2b-demo)
#
# Использование:
#   bash scripts/n3-vpn.sh status
#   bash scripts/n3-vpn.sh start
#   bash scripts/n3-vpn.sh stop
#   bash scripts/n3-vpn.sh test
#
# Конфиг: /opt/emkaro/vpn/b2b-makarova-1.ovpn (или n3.ovpn)
# Логин/пароль VPN (если нужны): /opt/emkaro/vpn/n3-auth.txt
set -euo pipefail

ROOT="${DEPLOY_ROOT:-/opt/emkaro}"
VPN_DIR="${ROOT}/vpn"
CONFIG="${VPN_CONFIG:-${VPN_DIR}/b2b-makarova-1.ovpn}"
LOG="${VPN_DIR}/openvpn.log"
PID="${VPN_DIR}/openvpn.pid"
AUTH="${VPN_DIR}/n3-auth.txt"
N3_URL="${N3_TEST_URL:-http://b2b-demo.n3health.ru/emk/EMKService.svc}"

cmd="${1:-status}"

ensure_config() {
  if [ ! -f "$CONFIG" ]; then
    echo "Нет конфига: $CONFIG"
    echo "Скачайте .ovpn из ЛК N3 и положите в ${VPN_DIR}/"
    exit 1
  fi
}

vpn_running() {
  pgrep -x openvpn >/dev/null 2>&1
}

tun_up() {
  ip a 2>/dev/null | grep -q 'tun[0-9]'
}

start_vpn() {
  ensure_config
  mkdir -p "$VPN_DIR"
  if vpn_running && tun_up; then
    echo "OpenVPN уже работает"
    return 0
  fi
  pkill openvpn 2>/dev/null || true
  sleep 2
  ip link delete tun0 2>/dev/null || true

  args=(--config "$CONFIG" --daemon --log "$LOG" --writepid "$PID")
  if grep -q '^auth-user-pass' "$CONFIG" 2>/dev/null; then
    if [ ! -f "$AUTH" ]; then
      echo "В конфиге auth-user-pass. Создайте ${AUTH}:"
      echo "  строка 1 — логин VPN из ЛК N3"
      echo "  строка 2 — пароль VPN"
      echo "  chmod 600 ${AUTH}"
      exit 1
    fi
    args+=(--auth-user-pass "$AUTH")
  fi

  openvpn "${args[@]}"
  sleep 5
  if ! grep -q 'Initialization Sequence Completed' "$LOG" 2>/dev/null; then
    echo "OpenVPN не подключился. Последние строки лога:"
    tail -20 "$LOG" || true
    exit 1
  fi
  echo "OpenVPN подключён"
}

stop_vpn() {
  pkill openvpn 2>/dev/null || true
  sleep 2
  ip link delete tun0 2>/dev/null || true
  echo "OpenVPN остановлен"
}

show_status() {
  echo "=== N3 VPN ==="
  echo "config: $CONFIG"
  if vpn_running; then
    echo "process: running ($(pgrep -x openvpn | tr '\n' ' '))"
  else
    echo "process: stopped"
  fi
  if tun_up; then
    ip -4 a show tun0 2>/dev/null | grep inet || ip a | grep tun
  else
    echo "tun: down"
  fi
  if [ -f "$LOG" ]; then
    echo "log tail:"
    tail -5 "$LOG" | sed 's/^/  /'
  fi
}

test_n3() {
  code="$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' "$N3_URL" || echo 000)"
  echo "curl $N3_URL -> HTTP $code"
  if [ "$code" = "000" ]; then
    echo "N3 недоступен — поднимите VPN: bash scripts/n3-vpn.sh start"
    exit 1
  fi
  echo "Сеть до N3 demo есть (код $code — нормально для SOAP endpoint)"
}

case "$cmd" in
  start) start_vpn ;;
  stop) stop_vpn ;;
  restart) stop_vpn; start_vpn ;;
  status) show_status ;;
  test) test_n3 ;;
  *)
    echo "Usage: $0 {start|stop|restart|status|test}"
    exit 1
    ;;
esac
