#!/bin/bash
# Деплой с Mac на сервер 201.51.0.171
# Использование:
#   bash scripts/deploy-to-server.sh [user@host]
#   bash scripts/deploy-to-server.sh --pack-only   # только архив (загрузка через панель Timeweb)
set -euo pipefail

PACK_ONLY=0
SERVER="${1:-root@201.51.0.171}"
if [ "${1:-}" = "--pack-only" ]; then
  PACK_ONLY=1
  SERVER="root@201.51.0.171"
elif [ "${2:-}" = "--pack-only" ]; then
  PACK_ONLY=1
fi

# IPv4: на Mac иногда ломается маршрут/таймаут при смешанном стеке; Timeweb — только A-запись
SSH_OPTS=(
  -4
  -o ConnectTimeout=25
  -o ServerAliveInterval=10
  -o ServerAliveCountMax=3
)

ssh_cmd() {
  ssh "${SSH_OPTS[@]}" "$@"
}

scp_cmd() {
  scp "${SSH_OPTS[@]}" "$@"
}

preflight_ssh() {
  local host="${SERVER#*@}"
  echo ">>> Проверка TCP 22 до ${host} ..."
  if command -v nc >/dev/null 2>&1; then
    if ! nc -4 -z -G 20 "${host}" 22 2>/dev/null; then
      echo ""
      echo "ОШИБКА: порт 22 на ${host} недоступен с этого Mac (nc timeout)."
      echo "  • Проверьте Firewall в панели Timeweb (входящий TCP 22)"
      echo "  • Попробуйте другую сеть (раздача с телефона)"
      echo "  • Временно: bash scripts/deploy-to-server.sh --pack-only"
      echo ""
      return 1
    fi
    echo "OK: TCP 22 открыт (nc)"
  fi
  echo ">>> Проверка SSH-входа на $SERVER ..."
  if ssh_cmd -o BatchMode=yes -o StrictHostKeyChecking=accept-new "$SERVER" "echo ssh_ok" 2>/dev/null; then
    echo "OK: SSH по ключу"
    return 0
  fi
  echo ""
  echo "TCP 22 открыт, но SSH не прошёл автоматически (нужен пароль или ключ)."
  echo "Проверьте вручную: ssh ${SSH_OPTS[*]} $SERVER"
  echo "Если по паролю — введите его при запросе scp/ssh ниже."
  echo ""
  return 0
}
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
if ! grep -q 'egiszDocumentUuidAlign' "$ROOT/app/api/health/route.ts" 2>/dev/null; then
  echo "ОШИБКА: в app/api/health/route.ts нет egiszDocumentUuidAlign — git pull и повторите деплой."
  exit 1
fi
echo "$BRANCH $COMMIT $(date -u +%Y-%m-%dT%H:%MZ)" > "$ROOT/.deploy-version"

echo ">>> Сборка архива..."
cd "$ROOT"
# Без macOS xattr в tar (на Linux иначе сотни предупреждений LIBARCHIVE.xattr)
COPYFILE_DISABLE=1 tar --no-xattrs \
  --exclude=node_modules --exclude=.next --exclude=.git --exclude=.tools \
  --exclude=.env --exclude='.env.*' --exclude=backups --exclude='*.tar.gz' \
  -czf "$ARCHIVE" .

if [ "$PACK_ONLY" = "1" ]; then
  echo ""
  echo ">>> Архив готов: $ARCHIVE"
  echo "Загрузите в Timeweb (файловый менеджер) в /opt/emkaro-update.tar.gz"
  echo "В веб-консоли сервера:"
  echo "  cd /opt/emkaro && export DEPLOY_NO_CACHE=1"
  echo "  bash scripts/server-update.sh /opt/emkaro-update.tar.gz"
  echo "  bash scripts/apply-migrations.sh"
  exit 0
fi

preflight_ssh

echo ">>> Загрузка на $SERVER:/opt/ ..."
scp_cmd "$ARCHIVE" "$SERVER:/opt/"

echo ">>> Обновление на сервере (DEPLOY_NO_CACHE=1, пересборка app без кэша)..."
ssh_cmd "$SERVER" bash -s <<'REMOTE'
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
