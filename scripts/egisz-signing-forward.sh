#!/bin/bash
# Проброс порта подписи: Docker (172.17.0.1:9876) -> localhost:9876 (SSH-туннель с Windows)
#
#   bash scripts/egisz-signing-forward.sh status
#   bash scripts/egisz-signing-forward.sh start
#   bash scripts/egisz-signing-forward.sh stop
set -euo pipefail

BIND_HOST="${SIGNING_BIND_HOST:-172.17.0.1}"
PORT="${SIGNING_PORT:-9876}"
TARGET="${SIGNING_TARGET:-127.0.0.1:9876}"
PID_FILE="/var/run/emkaro-signing-forward.pid"
LOG_FILE="/var/log/emkaro-signing-forward.log"

cmd="${1:-status}"

running() {
  pgrep -f "socat TCP-LISTEN:${PORT},bind=${BIND_HOST}" >/dev/null 2>&1
}

start_forward() {
  if running; then
    echo "socat уже слушает ${BIND_HOST}:${PORT}"
    return 0
  fi
  if ! command -v socat >/dev/null 2>&1; then
    echo "Установите socat: apt-get install -y socat"
    exit 1
  fi
  nohup socat "TCP-LISTEN:${PORT},bind=${BIND_HOST},fork,reuseaddr" "TCP:${TARGET}" \
    >>"$LOG_FILE" 2>&1 &
  echo $! >"$PID_FILE"
  sleep 1
  if running; then
    echo "Проброс ${BIND_HOST}:${PORT} -> ${TARGET}"
  else
    echo "Не удалось запустить socat. tail $LOG_FILE"
    exit 1
  fi
}

stop_forward() {
  if [ -f "$PID_FILE" ]; then
    kill "$(cat "$PID_FILE")" 2>/dev/null || true
    rm -f "$PID_FILE"
  fi
  pkill -f "socat TCP-LISTEN:${PORT},bind=${BIND_HOST}" 2>/dev/null || true
  echo "Остановлен"
}

case "$cmd" in
  start) start_forward ;;
  stop) stop_forward ;;
  restart) stop_forward; sleep 1; start_forward ;;
  status)
    if running; then
      echo "running: ${BIND_HOST}:${PORT} -> ${TARGET}"
      pgrep -af "socat TCP-LISTEN:${PORT}" || true
    else
      echo "stopped"
    fi
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status}"
    exit 1
    ;;
esac
