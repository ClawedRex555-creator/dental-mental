#!/bin/bash
# Деплой с Mac/Linux на сервер 201.51.0.171
# Использование: bash scripts/deploy-to-server.sh [user@host]
set -euo pipefail

SERVER="${1:-root@201.51.0.171}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ARCHIVE="/tmp/emkaro-update.tar.gz"

if [ -f "$ROOT/scripts/deploy-to-server.sh" ] && grep -q $'\r' "$ROOT/scripts/deploy-to-server.sh" 2>/dev/null; then
  echo "ОШИБКА: scripts/deploy-to-server.sh с CRLF (Windows). На Mac выполните:"
  echo "  sed -i '' 's/\\r$//' scripts/*.sh"
  exit 1
fi

BRANCH="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
COMMIT="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
echo ">>> Деплой: ветка=$BRANCH коммит=$COMMIT"

if ! command -v scp >/dev/null 2>&1 || ! command -v ssh >/dev/null 2>&1; then
  echo "ОШИБКА: нужны ssh и scp (на Mac: xcode-select --install)"
  exit 1
fi
if ! ssh -o BatchMode=yes -o ConnectTimeout=15 "$SERVER" "echo SSH_OK" >/dev/null 2>&1; then
  echo "ОШИБКА: нет SSH-доступа к $SERVER без пароля."
  echo "  Добавьте ключ: ssh-copy-id $SERVER"
  echo "  Проверка: ssh $SERVER 'echo ok'"
  exit 1
fi
if ! grep -q '"doctor"' "$ROOT/lib/constants.ts" 2>/dev/null || \
   ! grep -q '/warehouse.*doctor' "$ROOT/lib/constants.ts" 2>/dev/null; then
  echo "ОШИБКА: в lib/constants.ts нет доступа врача к /warehouse."
  echo "Обновите код: git fetch origin && git checkout main && git pull origin feat/egisz-cryptopro-n3-vpn"
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
if ! grep -q 'egiszDocumentUuidAlign' "$ROOT/app/api/health/route.ts" 2>/dev/null; then
  echo "ОШИБКА: в app/api/health/route.ts нет egiszDocumentUuidAlign — git pull и повторите деплой."
  exit 1
fi
if [ "$COMMIT" = "unknown" ] || [ "$BRANCH" = "unknown" ]; then
  echo "ПРЕДУПРЕЖДЕНИЕ: не git-репозиторий или нет .git — деплойте из клонированной папки."
fi
echo "$BRANCH $COMMIT $(date -u +%Y-%m-%dT%H:%MZ)" > "$ROOT/.deploy-version"

echo ">>> Сборка архива..."
cd "$ROOT"
# macOS bsdtar: без xattr/._ файлов (на Linux иначе LIBARCHIVE.xattr и ._*)
export COPYFILE_DISABLE=1
TAR_EXTRA=()
for opt in --no-xattrs --no-mac-metadata --disable-copyfile; do
  if tar "$opt" -cf /dev/null . 2>/dev/null; then
    TAR_EXTRA+=("$opt")
  fi
done
if [ "${#TAR_EXTRA[@]}" -eq 0 ]; then
  echo ">>> tar без --no-xattrs (старый tar) — используем только COPYFILE_DISABLE=1"
fi
tar "${TAR_EXTRA[@]}" \
  --exclude=node_modules --exclude=.next --exclude=.git --exclude=.tools \
  --exclude=.env --exclude='.env.*' --exclude=backups --exclude='*.tar.gz' \
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
echo ">>> Проверка версии на tstom:"
bash "$ROOT/scripts/check-server-version.sh" "https://tstom.emkaro.ru" || true
echo ""
echo "Готово. Ожидается features.patientAppointmentSearch=true в /api/health"
echo ""
echo "Если сборка на сервере упала (npm/DNS), на сервере:"
echo "  cd /opt/emkaro && DEPLOY_USE_PREBUILT=1 bash scripts/server-update.sh /opt/emkaro-update.tar.gz"
