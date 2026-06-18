#!/bin/sh
# Удаляет устаревшие файлы/маршруты, которые tar не удаляет при обновлении.
# Ломают next build: дубликаты страниц, старый middleware.ts
set -eu

ROOT="${1:-.}"
cd "$ROOT"

echo ">>> fix-stale-routes: $ROOT"

if [ -f proxy.ts ] && [ -f middleware.ts ]; then
  echo "    удаляю устаревший middleware.ts (есть proxy.ts)"
  rm -f middleware.ts
fi

DASH="app/(dashboard)"
for dir in appointments patients medical-records treatment-plans finance dashboard reports staff legal online-booking my-salary; do
  if [ -d "$DASH/$dir" ] && [ -d "$DASH/(modules)/$dir" ]; then
    echo "    удаляю $DASH/$dir (дубликат (modules)/$dir)"
    rm -rf "$DASH/$dir"
  fi
done

if [ -d "$DASH/(modules)/warehouse" ]; then
  echo "    удаляю $DASH/(modules)/warehouse"
  rm -rf "$DASH/(modules)/warehouse"
fi

echo ">>> fix-stale-routes: готово"
