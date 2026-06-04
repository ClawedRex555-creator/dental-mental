#!/bin/bash
# Безопасная очистка сервера Emkaro (диск + Docker, БД не трогаем)
#
# На сервере:
#   cd /opt/emkaro && git pull origin main
#   bash scripts/server-clean.sh          # посмотреть, что будет удалено
#   bash scripts/server-clean.sh --apply  # выполнить
#   bash scripts/server-clean.sh --apply --aggressive  # + старые Docker-образы
#
set -euo pipefail

ROOT="${DEPLOY_ROOT:-/opt/emkaro}"
APPLY=false
AGGRESSIVE=false
KEEP_BACKUPS="${KEEP_BACKUPS:-14}"

for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=true ;;
    --aggressive) AGGRESSIVE=true ;;
    -h | --help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *)
      echo "Неизвестный аргумент: $arg (см. --help)"
      exit 1
      ;;
  esac
done

cd "$ROOT"

if [ ! -f "docker-compose.yml" ]; then
  echo "docker-compose.yml не найден в $ROOT"
  exit 1
fi

run_or_echo() {
  if $APPLY; then
    eval "$@"
  else
    echo "  [dry-run] $*"
  fi
}

echo "=== Emkaro: очистка сервера ==="
echo "Каталог: $ROOT"
echo "Режим: $( $APPLY && echo 'ПРИМЕНИТЬ' || echo 'просмотр (добавьте --apply)' )"
echo ""

echo ">>> Диск до:"
df -h "$ROOT" /var/lib/docker 2>/dev/null || df -h "$ROOT"
echo ""

echo ">>> Docker (до):"
docker system df 2>/dev/null || true
echo ""

# 1) Дубликаты маршрутов Next.js (ломают build)
DASH="app/(dashboard)"
DUP=0
for dir in appointments patients medical-records treatment-plans finance warehouse dashboard reports staff legal online-booking my-salary; do
  if [ -d "$ROOT/$DASH/$dir" ] && [ -d "$ROOT/$DASH/(modules)/$dir" ]; then
    echo ">>> Устаревший маршрут: $DASH/$dir"
    run_or_echo "rm -rf \"$ROOT/$DASH/$dir\""
    DUP=$((DUP + 1))
  fi
done
if [ "$DUP" -eq 0 ]; then
  echo ">>> Дубликатов маршрутов нет"
fi
echo ""

# 2) Архивы обновления
for arc in /opt/emkaro-update.tar.gz /tmp/emkaro-update.tar.gz; do
  if [ -f "$arc" ]; then
    echo ">>> Архив обновления: $arc ($(du -h "$arc" | cut -f1))"
    run_or_echo "rm -f \"$arc\""
  fi
done
echo ""

# 3) Старые бэкапы БД (оставить последние KEEP_BACKUPS)
if [ -d "$ROOT/backups" ]; then
  mapfile -t OLDBACKUPS < <(ls -1t "$ROOT/backups"/dentalcloud-*.sql 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) || true)
  if [ "${#OLDBACKUPS[@]}" -eq 0 ]; then
    echo ">>> Бэкапы: удалять нечего (храним $KEEP_BACKUPS последних)"
  else
    echo ">>> Бэкапы: удалить ${#OLDBACKUPS[@]} файл(ов), оставить $KEEP_BACKUPS последних"
    for f in "${OLDBACKUPS[@]}"; do
      run_or_echo "rm -f \"$f\""
    done
  fi
  echo "    Сейчас в backups/: $(ls -1 "$ROOT/backups"/dentalcloud-*.sql 2>/dev/null | wc -l | tr -d ' ') файл(ов)"
else
  echo ">>> Каталог backups/ отсутствует"
fi
echo ""

# 4) Docker build cache (безопасно для данных)
echo ">>> Docker build cache"
if $AGGRESSIVE; then
  run_or_echo "docker builder prune -af"
  run_or_echo "docker image prune -af"
else
  run_or_echo "docker builder prune -f"
  run_or_echo "docker image prune -f"
fi
run_or_echo "docker container prune -f"
echo ""

# 5) Неиспользуемые сети
run_or_echo "docker network prune -f"
echo ""

echo ">>> НЕ выполняется (данные клиник):"
echo "    docker compose down -v"
echo "    docker volume prune"
echo ""

if ! $APPLY; then
  echo "============================================"
  echo "  Это был просмотр. Для очистки:"
  echo "  bash scripts/server-clean.sh --apply"
  echo "============================================"
  exit 0
fi

echo ">>> Диск после:"
df -h "$ROOT" /var/lib/docker 2>/dev/null || df -h "$ROOT"
echo ""
echo ">>> Docker (после):"
docker system df 2>/dev/null || true
echo ""
echo "============================================"
  echo "  Готово. Для обновления кода:"
  echo "  git pull origin main && bash scripts/server-update.sh"
  echo "============================================"
