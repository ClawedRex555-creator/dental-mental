#!/bin/bash
# Деплой с Mac на сервер 201.51.0.171
# Использование: bash scripts/deploy-to-server.sh [user@host]
set -euo pipefail

SERVER="${1:-root@201.51.0.171}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ARCHIVE="/tmp/emkaro-update.tar.gz"

echo ">>> Сборка архива..."
cd "$ROOT"
tar --exclude=node_modules --exclude=.next --exclude=.git --exclude=.tools \
  -czf "$ARCHIVE" .

echo ">>> Загрузка на $SERVER:/opt/ ..."
scp "$ARCHIVE" "$SERVER:/opt/"

echo ">>> Обновление на сервере..."
ssh "$SERVER" bash -s <<'REMOTE'
set -euo pipefail
cd /opt/emkaro
bash scripts/server-update.sh /opt/emkaro-update.tar.gz
echo ">>> Миграции БД..."
bash scripts/apply-migrations.sh
echo ""
echo ">>> Проверьте .env — при первом деплое compliance добавьте:"
echo "    PHI_ENCRYPTION_KEY, SUPERADMIN_LOGIN, SUPERADMIN_PASSWORD"
REMOTE

echo ""
echo "Готово. Проверьте: https://emkaro.ru/platform/login"
