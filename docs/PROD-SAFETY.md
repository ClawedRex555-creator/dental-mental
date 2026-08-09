# Prod safety (Emkaro)

Стабильность и сохранность БД важнее скорости фич.

## Freeze (обязательно)

**На старте рабочей недели (пн–вт) и пока прод спокоен — не деплоить «улучшения».**

Запрещено без отдельного окна и явного согласования:

- Менять контракт sync GET/PUT / merge так, что клиент и сервер могут разойтись
- `DROP` / wipe / полный restore БД «на всякий случай»
- Schema migrations, затрагивающие `clinic_snapshots`
- Command API / SSE / вынос `patientFiles` из JSONB
- Массовые рефакторинги store / RBAC / auth

Разрешено:

- Hotfix при подтверждённом инциденте (с бэкапом **до** деплоя)
- Аддитивные защиты: пустое поле с клиента не затирает непустое на сервере
- UI-only: disabled кнопки, toast, navigation helper без смены API
- Документация, тесты, dry-run скрипты

## Перед каждым деплоем на прод

На сервере (уже вызывается из `scripts/server-update.sh`):

```bash
cd /opt/emkaro && bash scripts/backup-db.sh /opt/emkaro pre-deploy
cat backups/.last-pre-deploy-backup
```

После деплоя с Mac:

```bash
bash scripts/check-server-version.sh https://tstom.emkaro.ru <commit>
bash scripts/check-server-version.sh https://demo.emkaro.ru <commit>
bash scripts/check-server-version.sh https://elanar.emkaro.ru <commit>
```

Ручной smoke: расписание открывается → пациент с телефоном у owner/admin → запись открывается/сохраняется → врач не видит телефон в UI.

## Наблюдение (начало недели)

С Mac (только чтение health, без изменений БД):

```bash
bash scripts/prod-observe-checklist.sh
```

1. Health трёх клиник (скрипт выше)
2. Автобэкапы: на сервере `ls -lht /opt/emkaro/backups/*.sql | head` и при наличии `systemctl list-timers emkaro-backup.timer --all`
3. Путь отката: `cat /opt/emkaro/backups/.last-pre-deploy-backup` и `scripts/restore-patient-phones-from-backup.sh` / `restore-db-from-backup.sh`
4. При баге: воспроизвести → оценить риск потери данных → hotfix только если ущерб > риск деплоя

## Откат данных

- Точечно (телефоны/PHI): `bash scripts/restore-patient-phones-from-backup.sh backups/….sql --apply`
- Полный restore БД — только при катастрофе и с подтверждением `yes`

## Волна 3 платформы (отложено)

Не стартовать в том же деплое, что command pay API; только по запросу клиники / spare capacity:

- SSE `snapshot.updated` (`lib/sync-feature-flags.ts`)
- Schema migrations вокруг `clinic_snapshots`
- Вынос `patientFiles.dataUrl` из JSONB
- Крупные EGISZ (CryptoPro live / новые SEMD) и mobile staff write API

Оплата акта уже может идти через `POST /api/clinic/work-acts/pay` (с fallback на snapshot).

См. также [DEPLOY.md](./DEPLOY.md).
