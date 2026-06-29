#!/bin/bash
# Устанавливает ежедневный автозапуск scripts/backup-db.sh через systemd timer.
# Запуск на сервере:
#   cd /opt/emkaro && sudo bash scripts/install-backup-timer.sh
# Проверка:
#   systemctl status emkaro-backup.timer
#   systemctl list-timers --all | grep emkaro-backup
set -euo pipefail

ROOT="${DEPLOY_ROOT:-/opt/emkaro}"
SERVICE_PATH="/etc/systemd/system/emkaro-backup.service"
TIMER_PATH="/etc/systemd/system/emkaro-backup.timer"

if [ "$(id -u)" -ne 0 ]; then
  echo "ОШИБКА: нужен root (запустите через sudo)."
  exit 1
fi

if [ ! -f "$ROOT/scripts/backup-db.sh" ]; then
  echo "ОШИБКА: не найден $ROOT/scripts/backup-db.sh"
  exit 1
fi

cat > "$SERVICE_PATH" <<EOF
[Unit]
Description=Emkaro PostgreSQL backup
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
WorkingDirectory=$ROOT
ExecStart=/bin/bash $ROOT/scripts/backup-db.sh $ROOT
EOF

cat > "$TIMER_PATH" <<'EOF'
[Unit]
Description=Run Emkaro backup daily

[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now emkaro-backup.timer

echo "Таймер установлен: emkaro-backup.timer"
echo "Следующие запуски:"
systemctl list-timers emkaro-backup.timer --all
echo ""
echo "Если на сервере нет systemd, используйте cron:"
echo "0 3 * * * cd $ROOT && /bin/bash $ROOT/scripts/backup-db.sh $ROOT >/var/log/emkaro-backup.log 2>&1"
