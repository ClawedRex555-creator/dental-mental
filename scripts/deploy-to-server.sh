#!/bin/bash
# Деплой с Mac: сборка .next в Docker → архив → сервер (~1 мин на VPS).
#   bash scripts/deploy-to-server.sh [user@host]
#   bash scripts/deploy-to-server.sh --pack-only
set -euo pipefail

PACK_ONLY=0
SERVER="${1:-root@201.51.0.171}"
if [ "${1:-}" = "--pack-only" ]; then
  PACK_ONLY=1
  SERVER="root@201.51.0.171"
elif [ "${2:-}" = "--pack-only" ]; then
  PACK_ONLY=1
fi

SSH_OPTS=(
  -4
  -o ConnectTimeout=25
  -o TCPKeepAlive=yes
  -o ServerAliveInterval=30
  -o ServerAliveCountMax=60
)

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ARCHIVE="/tmp/emkaro-update.tar.gz"

BRANCH="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
COMMIT="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
echo ">>> Деплой: ветка=$BRANCH коммит=$COMMIT"
echo "$BRANCH $COMMIT $(date -u +%Y-%m-%dT%H:%MZ)" > "$ROOT/.deploy-version"

bash "$ROOT/scripts/local-build-for-deploy.sh"

echo ">>> Удаление корневого node_modules (linux из Docker; для dev на Mac потом: npm ci)..."
rm -rf "$ROOT/node_modules"

echo ">>> Сборка архива..."
cd "$ROOT"
# Не используем --exclude=node_modules: на macOS bsdtar режет ВСЕ node_modules, включая .next/standalone/
COPYFILE_DISABLE=1 tar --no-xattrs \
  --exclude=.git --exclude=.tools \
  --exclude=.next/cache \
  --exclude=.env --exclude='.env.*' --exclude=backups --exclude='*.tar.gz' \
  -czf "$ARCHIVE" .

if tar -tzf "$ARCHIVE" | grep -qE '^./node_modules/'; then
  echo "ОШИБКА: в архив попал корневой ./node_modules/ — проверьте tar --exclude"
  exit 1
fi

if ! tar -tzf "$ARCHIVE" | grep -qE '^(\./)?\.next/standalone/node_modules/next/package\.json$'; then
  echo "ОШИБКА: в архиве нет .next/standalone/node_modules/next — проверьте сборку standalone"
  exit 1
fi

if [ "$PACK_ONLY" = "1" ]; then
  echo ""
  echo ">>> Архив: $ARCHIVE"
  echo "На сервере:"
  echo "  cd /opt/emkaro && bash scripts/server-update.sh /opt/emkaro-update.tar.gz"
  echo "  bash scripts/apply-migrations.sh"
  exit 0
fi

echo ">>> Загрузка на $SERVER:/opt/ ..."
scp "${SSH_OPTS[@]}" "$ARCHIVE" "$SERVER:/opt/"

echo ">>> Обновление на сервере..."
if ! ssh "${SSH_OPTS[@]}" "$SERVER" bash -s <<'REMOTE'
set -euo pipefail
cd /opt/emkaro
if ! bash scripts/server-update.sh /opt/emkaro-update.tar.gz; then
  echo ""
  echo "=== Логи app (после ошибки server-update) ==="
  docker compose logs app --tail 120 2>/dev/null || true
  exit 1
fi
bash scripts/apply-migrations.sh
REMOTE
then
  echo ""
  echo "Деплой не завершён. На сервере: cd /opt/emkaro && docker compose logs app --tail 120"
  exit 1
fi

echo ""
bash "$ROOT/scripts/check-server-version.sh" "https://demo.emkaro.ru" "$COMMIT" || true
echo ""
echo "Бэкап перед деплоем: на сервере cat /opt/emkaro/backups/.last-pre-deploy-backup"
echo "Готово."
