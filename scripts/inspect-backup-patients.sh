#!/bin/bash
# Подсчёт пациентов в SQL-дампах (clinic_snapshots.data -> patients[])
# Использование на сервере:
#   cd /opt/emkaro && bash scripts/inspect-backup-patients.sh
#   bash scripts/inspect-backup-patients.sh backups/dentalcloud-20260601-160907.sql
set -euo pipefail

ROOT="${DEPLOY_ROOT:-/opt/emkaro}"
cd "$ROOT"

count_patients_in_dump() {
  local file="$1"
  # В дампе пациенты — объекты в массиве "patients":[{..."id":...},...]
  # Считаем вхождения "id" сразу после типичных полей пациента (грубо, но стабильно для сравнения файлов)
  local n
  n=$(grep -o '"lastName"' "$file" 2>/dev/null | wc -l | tr -d ' ')
  echo "${n:-0}"
}

if [ $# -ge 1 ]; then
  for f in "$@"; do
  if [ ! -f "$f" ]; then
    echo "Нет файла: $f"
    continue
  fi
  size=$(ls -lh "$f" | awk '{print $5}')
  n=$(count_patients_in_dump "$f")
  echo "$n пациентов  ($size)  $f"
  done
  exit 0
fi

if [ ! -d backups ]; then
  echo "Каталог backups/ не найден в $(pwd)"
  exit 1
fi

echo "Файл                          Размер   ~пациентов"
echo "------------------------------------------------"

for f in $(ls -1t backups/*.sql 2>/dev/null); do
  size=$(ls -lh "$f" | awk '{print $5}')
  n=$(count_patients_in_dump "$f")
  printf "%-32s %6s   %s\n" "$(basename "$f")" "$size" "$n"
done

echo ""
echo "Сравнение с живой БД:"
docker compose exec -T postgres psql -U mis -d dentalcloud -t -A -c \
  "SELECT c.slug || ': ' || COALESCE(jsonb_array_length(cs.data->'patients'),0)
   FROM clinic_snapshots cs JOIN clinics c ON c.id = cs.clinic_id;" 2>/dev/null || \
  echo "(запустите из каталога с docker compose)"
