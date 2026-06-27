#!/bin/bash
# Деплой с Mac на сервер 201.51.0.171
# Использование:
#   bash scripts/deploy-to-server.sh [user@host]
#   bash scripts/deploy-to-server.sh --pack-only
#   DEPLOY_SKIP_LOCAL_BUILD=1 bash scripts/deploy-to-server.sh   # без Docker на Mac
#   DEPLOY_BACKGROUND=1 bash scripts/deploy-to-server.sh           # фон на сервере
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
# Долгая сборка Next в Docker грузит CPU — без keepalive SSH рвётся (~30 с тишины).
SSH_OPTS=(
  -4
  -o ConnectTimeout=25
  -o TCPKeepAlive=yes
  -o ServerAliveInterval=30
  -o ServerAliveCountMax=60
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
  echo "При обрыве на сборке: DEPLOY_BACKGROUND=1 bash scripts/deploy-to-server.sh"
  echo "Или на сервере: cd /opt/emkaro && DEPLOY_USE_PREBUILT=1 bash scripts/server-update.sh"
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

run_local_build() {
  if [ "${DEPLOY_SKIP_LOCAL_BUILD:-0}" = "1" ]; then
    echo ">>> DEPLOY_SKIP_LOCAL_BUILD=1 — .next на Mac не собираем (npm на сервере)"
    rm -f "$ROOT/.deploy-next-bundle"
    return 0
  fi
  if ! command -v docker >/dev/null 2>&1; then
    echo ""
    echo "ПРЕДУПРЕЖДЕНИЕ: Docker на Mac не найден — сборка будет на VPS (медленно)."
    echo "  Лучше: установить Docker Desktop, запустить, повторить deploy."
    echo "  Сейчас: архив без .next → npm ci на сервере."
    echo ""
    rm -f "$ROOT/.deploy-next-bundle"
    return 0
  fi
  if ! docker info >/dev/null 2>&1; then
    echo ""
    echo "ПРЕДУПРЕЖДЕНИЕ: Docker не запущен — откройте Docker Desktop и повторите."
    echo "  Сейчас продолжаем без .next (сборка на VPS)."
    echo ""
    rm -f "$ROOT/.deploy-next-bundle"
    return 0
  fi
  bash "$ROOT/scripts/local-build-for-deploy.sh"
}

run_local_build

echo ">>> Сборка архива..."
cd "$ROOT"
# Без macOS xattr в tar (на Linux иначе сотни предупреждений LIBARCHIVE.xattr)
# .next/standalone в архиве — npm на VPS не нужен; исключаем только cache
COPYFILE_DISABLE=1 tar --no-xattrs \
  --exclude=node_modules --exclude=.git --exclude=.tools \
  --exclude=.next/cache \
  --exclude=.env --exclude='.env.*' --exclude=backups --exclude='*.tar.gz' \
  -czf "$ARCHIVE" .

if grep -q 'platform=linux-musl' "$ROOT/.deploy-next-bundle" 2>/dev/null; then
  echo ">>> Очистка linux node_modules (после Docker-сборки; для dev на Mac: npm ci)"
  rm -rf "$ROOT/node_modules"
fi

if [ "$PACK_ONLY" = "1" ]; then
  echo ""
  echo ">>> Архив готов: $ARCHIVE"
  echo "Загрузите в Timeweb (файловый менеджер) в /opt/emkaro-update.tar.gz"
  echo "В веб-консоли сервера:"
  echo "  cd /opt/emkaro && export DEPLOY_USE_PREBUILT=1"
  echo "  bash scripts/server-update.sh /opt/emkaro-update.tar.gz"
  echo "  bash scripts/apply-migrations.sh"
  exit 0
fi

preflight_ssh

echo ">>> Загрузка на $SERVER:/opt/ ..."
scp_cmd "$ARCHIVE" "$SERVER:/opt/"

echo ">>> Обновление на сервере (prebuilt, быстрый путь)..."
if [ "${DEPLOY_BACKGROUND:-0}" = "1" ]; then
  echo ">>> DEPLOY_BACKGROUND=1 — обновление в фоне на сервере (лог: /tmp/emkaro-deploy.log)"
  ssh_cmd "$SERVER" bash -s <<'REMOTE'
set -euo pipefail
LOG=/tmp/emkaro-deploy.log
: > "$LOG"
nohup bash -c '
  set -euo pipefail
  export DEPLOY_USE_PREBUILT=1
  cd /opt/emkaro
  bash scripts/server-update.sh /opt/emkaro-update.tar.gz
  bash scripts/apply-migrations.sh
  echo "DEPLOY_FINISHED_OK $(date -u +%Y-%m-%dT%H:%MZ)"
' >>"$LOG" 2>&1 &
echo "PID=$! — смотрите: tail -f $LOG"
REMOTE
  echo ""
  echo "Деплой запущен в фоне. Проверка: ssh $SERVER 'tail -30 /tmp/emkaro-deploy.log'"
  exit 0
fi

ssh_cmd "$SERVER" bash -s <<'REMOTE'
set -euo pipefail
export DEPLOY_USE_PREBUILT=1
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
