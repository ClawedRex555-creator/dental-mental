#!/bin/bash
# Скачать ops-скрипты с GitHub, если /opt/emkaro развёрнут из tar (без .git)
#
#   cd /opt/emkaro
#   bash scripts/fetch-ops-scripts.sh
#
set -euo pipefail

ROOT="${DEPLOY_ROOT:-/opt/emkaro}"
REPO="${EMKARO_GITHUB_RAW:-https://raw.githubusercontent.com/ClawedRex555-creator/dental-mental/main}"

cd "$ROOT"
mkdir -p scripts

for name in server-clean.sh server-update.sh server-docker-prebuilt-image.sh local-build-for-deploy.sh backup-db.sh apply-migrations.sh fix-crlf.sh fetch-ops-scripts.sh; do
  echo ">>> $name"
  curl -fsSL -o "scripts/$name" "$REPO/scripts/$name"
  chmod +x "scripts/$name"
done

for name in fix-server-env.py inspect-server-env.py clean-server-env.py; do
  echo ">>> $name"
  curl -fsSL -o "scripts/$name" "$REPO/scripts/$name"
done

echo ""
echo "Готово. Дальше:"
echo "  bash scripts/server-clean.sh"
echo "  bash scripts/server-clean.sh --apply"
echo "  bash scripts/server-update.sh /opt/emkaro-update.tar.gz   # если есть архив"
