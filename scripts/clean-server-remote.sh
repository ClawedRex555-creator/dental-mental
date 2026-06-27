#!/bin/bash
# Очистка сервера с Mac (безопасно: БД и .env не трогаем)
#
#   bash scripts/clean-server-remote.sh              # просмотр
#   bash scripts/clean-server-remote.sh --apply      # очистить
#   bash scripts/clean-server-remote.sh --apply --aggressive
#   bash scripts/clean-server-remote.sh --apply --deep
#
set -euo pipefail

SERVER="root@201.51.0.171"
REMOTE_ARGS=()

for arg in "$@"; do
  case "$arg" in
    --apply | --aggressive | --deep) REMOTE_ARGS+=("$arg") ;;
    root@* | *@*)
      SERVER="$arg"
      ;;
    -h | --help)
      sed -n '2,7p' "$0"
      exit 0
      ;;
    *)
      echo "Неизвестный аргумент: $arg"
      exit 1
      ;;
  esac
done

SSH_OPTS=(
  -4
  -o ConnectTimeout=25
  -o ServerAliveInterval=10
  -o ServerAliveCountMax=3
)

echo ">>> Очистка на $SERVER (режим: ${REMOTE_ARGS[*]:-просмотр})"
echo ""

ssh "${SSH_OPTS[@]}" "$SERVER" bash -s <<REMOTE
set -euo pipefail
ROOT=/opt/emkaro
if [ ! -f "\$ROOT/scripts/server-clean.sh" ]; then
  echo "Нет scripts/server-clean.sh — сначала задеплойте код или:"
  echo "  cd \$ROOT && bash scripts/fetch-ops-scripts.sh"
  exit 1
fi
cd "\$ROOT"
bash scripts/server-clean.sh ${REMOTE_ARGS[@]+"${REMOTE_ARGS[@]}"}
REMOTE

echo ""
echo "Готово."
