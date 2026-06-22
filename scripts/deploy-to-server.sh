#!/bin/bash
# Деплой с Mac на сервер 201.51.0.171
# Использование: bash scripts/deploy-to-server.sh [user@host]
set -euo pipefail

SERVER="${1:-root@201.51.0.171}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ARCHIVE="/tmp/emkaro-update.tar.gz"

BRANCH="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
COMMIT="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
echo ">>> Деплой: ветка=$BRANCH коммит=$COMMIT"
if ! grep -q '"doctor"' "$ROOT/lib/constants.ts" 2>/dev/null || \
   ! grep -q '/warehouse.*doctor' "$ROOT/lib/constants.ts" 2>/dev/null; then
  echo "ОШИБКА: в lib/constants.ts нет доступа врача к /warehouse."
  echo "Переключитесь на актуальную ветку: git checkout main && git pull"
  exit 1
fi
if [ ! -f "$ROOT/components/shared/patient-search-select.tsx" ]; then
  echo "ОШИБКА: нет components/shared/patient-search-select.tsx — деплойте из актуальной папки проекта."
  exit 1
fi
if ! grep -q 'canAccessTreatmentPlansCatalog' "$ROOT/lib/rbac.ts" 2>/dev/null; then
  echo "ОШИБКА: в lib/rbac.ts нет canAccessTreatmentPlansCatalog — код устарел."
  exit 1
fi
if ! grep -q 'egiszCdaSnilsDigits' "$ROOT/app/api/health/route.ts" 2>/dev/null; then
  echo "ОШИБКА: в app/api/health/route.ts нет egiszCdaSnilsDigits — git pull и повторите деплой."
  exit 1
fi
echo "$BRANCH $COMMIT $(date -u +%Y-%m-%dT%H:%MZ)" > "$ROOT/.deploy-version"

echo ">>> Сборка архива..."
cd "$ROOT"
# Без macOS xattr в tar (на Linux иначе сотни предупреждений LIBARCHIVE.xattr)
COPYFILE_DISABLE=1 tar --no-xattrs \
  --exclude=node_modules --exclude=.next --exclude=.git --exclude=.tools \
  -czf "$ARCHIVE" .

echo ">>> Загрузка на $SERVER:/opt/ ..."
scp "$ARCHIVE" "$SERVER:/opt/"

echo ">>> Обновление на сервере (DEPLOY_NO_CACHE=1, пересборка app без кэша)..."
ssh "$SERVER" bash -s <<'REMOTE'
set -euo pipefail
export DEPLOY_NO_CACHE=1
cd /opt/emkaro
bash scripts/server-update.sh /opt/emkaro-update.tar.gz
echo ">>> Миграции БД..."
bash scripts/apply-migrations.sh
echo ""
echo ">>> Проверьте .env — при первом деплое compliance добавьте:"
echo "    PHI_ENCRYPTION_KEY, TLS_ASK_SECRET, SUPERADMIN_LOGIN, SUPERADMIN_PASSWORD"
REMOTE

echo ""
echo ">>> Проверка версии на demo:"
bash "$ROOT/scripts/check-server-version.sh" "https://demo.emkaro.ru" || true
echo ""
echo "Готово. Ожидается features.patientAppointmentSearch=true в /api/health"
