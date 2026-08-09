# Деплой Emkaro с поддоменами

Каждая клиника — свой поддомен: `ulybka.emkaro.ru`, `zubki.emkaro.ru`.  
Корневой домен `emkaro.ru` — портал со списком клиник.

**Перед деплоем на рабочую неделю:** см. [PROD-SAFETY.md](./PROD-SAFETY.md) (freeze пн–вт, бэкап, запрет wipe/schema/command API).

---

## 1. DNS (у регистратора домена)

| Запись | Тип | Значение |
|--------|-----|----------|
| `@` | A | IP вашего VPS |
| `*` | A | IP вашего VPS (wildcard для поддоменов) |

Проверка (через 5–30 мин):

```bash
dig emkaro.ru +short
dig ulybka.emkaro.ru +short
```

---

## 2. Сервер (Ubuntu 22/24)

```bash
sudo apt update && sudo apt install -y git docker.io docker-compose-plugin
sudo usermod -aG docker $USER
# перелогиньтесь
```

---

## 3. Установка

```bash
git clone <ваш-репозиторий> /opt/emkaro
cd /opt/emkaro
cp .env.example .env
nano .env
```

Заполните `.env`:

```env
AUTH_SECRET=<openssl rand -base64 48>
APP_ROOT_DOMAIN=emkaro.ru
ACME_EMAIL=admin@emkaro.ru
POSTGRES_PASSWORD=<сильный-пароль-БД>
PHI_ENCRYPTION_KEY=<openssl rand -base64 48>
ENABLE_DEMO_ACCOUNTS=false
```

После обновления `.env` перезапустите Caddy и app:

```bash
docker compose up -d --build app caddy
```

---

## 4. Запуск (Docker)

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f caddy   # первый выпуск SSL может занять 1–2 мин
```

Стек: **Caddy** (HTTPS + wildcard) → **app** (Next.js) → **PostgreSQL**.

---

## 5. Первая клиника

```bash
docker compose exec app node scripts/create-clinic.mjs \
  --slug ulybka \
  --name "Стоматология Улыбка" \
  --email owner@ulybka.ru \
  --password 'YourStrongPass123!' \
  --owner-name "Иван Иванов"
```

Откройте: **https://ulybka.emkaro.ru/login**

---

## 6. Ещё клиники

```bash
docker compose exec app node scripts/create-clinic.mjs \
  --slug zubki \
  --name "Клиника Zubki" \
  --email admin@zubki.ru \
  --password 'AnotherPass123!'
```

### SSL для нового поддомена

1. Добавьте блок в `deploy/Caddyfile` (по образцу `demo`, `tstom`, `elanar`):

```caddyfile
zubki.{$APP_ROOT_DOMAIN} {
  encode gzip
  reverse_proxy app:3000
}
```

2. Перезапустите Caddy: `docker compose restart caddy` (или `docker compose up -d caddy`).

> **Не используйте** `on_demand_tls` + `*.домен` без отладки `/api/internal/tls-ask` — при сбое ask все поддомены теряют HTTPS.

### Клиника «Эланар»

1. Создайте tenant в БД:

```bash
export ELANAR_OWNER_PASSWORD='YourStrongPass123!'
export ELANAR_OWNER_EMAIL='owner@elanar.ru'   # по желанию
bash scripts/create-elanar-clinic.sh
```

Вход: **https://elanar.emkaro.ru/login** (подставьте свой `APP_ROOT_DOMAIN`).

---

## 7. Локальная разработка с поддоменами

В `.env.local`:

```env
APP_ROOT_DOMAIN=localhost
DATABASE_URL=postgresql://mis:mis@localhost:5432/dentalcloud
DEFAULT_CLINIC_SLUG=demo
```

```bash
docker compose up postgres -d
npm run db:init
npm run create-clinic -- --slug demo --name "Demo" --email owner@demo.ru --password demo12345
npm run dev
```

Открыть: **http://demo.localhost:3000/login**  
(браузеры резолвят `*.localhost` автоматически)

---

## 8. Без Docker (PM2 + nginx)

См. раздел «Ручной деплой» в конце. Для wildcard SSL проще Caddy в Docker.

---

## 9. Бэкапы

### Перед каждым деплоем (автоматически)

Скрипт `scripts/server-update.sh` **всегда** делает дамп PostgreSQL **до** распаковки нового кода:

```bash
bash scripts/backup-db.sh /opt/emkaro pre-deploy
# → backups/dentalcloud-pre-deploy-20260706-195528.sql
```

Путь к последнему бэкапу деплоя:

```bash
cat /opt/emkaro/backups/.last-pre-deploy-backup
```

Деплой с Mac (`bash scripts/deploy-to-server.sh`) вызывает `server-update.sh` на сервере — бэкап создаётся автоматически.

**Не используйте** `docker compose up -d --build` без `server-update.sh` на production — бэкап не создастся.

### Ручной бэкап

```bash
cd /opt/emkaro
bash scripts/backup-db.sh
```

### Ежедневный бэкап (systemd, 03:00)

```bash
cd /opt/emkaro && sudo bash scripts/install-backup-timer.sh
systemctl status emkaro-backup.timer
```

### Восстановление из бэкапа

```bash
cd /opt/emkaro
ls -lt backups/dentalcloud-*.sql | head
bash scripts/restore-db-from-backup.sh backups/dentalcloud-pre-deploy-20260706-195528.sql
```

Скрипт восстановления сначала сделает страховочный дамп текущей БД, затем пересоздаст `dentalcloud` из выбранного файла.

Проверка после восстановления:

```bash
docker compose exec -T postgres psql -U mis -d dentalcloud -c \
  "SELECT c.slug,
          COALESCE(jsonb_array_length(cs.data->'appointments'), 0) AS appointments,
          cs.updated_at
   FROM clinic_snapshots cs JOIN clinics c ON c.id = cs.clinic_id;"
```

### Ротация

`backup-db.sh` хранит **20** последних файлов (`BACKUP_KEEP_COUNT=30` при необходимости).
Старые удаляются автоматически. Очистка диска: `bash scripts/server-clean.sh --apply`.

### Старый способ (вручную)

```bash
docker compose exec postgres pg_dump -U mis dentalcloud > backup-$(date +%F).sql
```

---

## 9.1. Безопасное обновление (данные не теряются)

PostgreSQL хранится в **именованном volume** `pg-data`. Команда `docker compose up -d --build` **не удаляет** базу.

**Можно:**
```bash
cd /opt/emkaro
docker compose up -d --build
```

**Нельзя** (удалит все данные):
```bash
docker compose down -v    # флаг -v стирает volumes!
docker volume rm emkaro_pg-data
```

**Рекомендуемый порядок на сервере** (бэкап + обновление):

```bash
# 1. Загрузить архив на сервер: /opt/emkaro-update.tar.gz
cd /opt/emkaro
bash scripts/server-update.sh
```

Скрипт:
1. Делает дамп БД в `backups/dentalcloud-pre-deploy-*.sql` (метка `pre-deploy`)
2. Распаковывает код (`.env` сохраняется)
3. Пересобирает контейнер `app`

При ошибке health-check в логе будет команда отката к бэкапу перед деплоем.

**Важно:** не меняйте `POSTGRES_PASSWORD` в `.env` после первого запуска — иначе приложение не подключится к уже существующей базе (данные останутся в volume, но будут «недоступны»).

Проверка данных после обновления:

```bash
docker compose exec postgres psql -U mis -d dentalcloud -c \
  "SELECT c.slug, jsonb_array_length(cs.data->'patients') AS patients
   FROM clinic_snapshots cs JOIN clinics c ON c.id = cs.clinic_id;"
```

---

## 9.2. Старый раздел бэкапов (файлы app)

```bash
# Файлы data/ (если используются)
docker compose exec app tar -czf - /app/data > data-backup.tar.gz
```

---

## 10. Чеклист перед production

- [ ] `AUTH_SECRET` уникален
- [ ] `PHI_ENCRYPTION_KEY` задан (production не стартует без него)
- [ ] `ENABLE_DEMO_ACCOUNTS=false`
- [ ] Новые клиники добавлены в `deploy/Caddyfile` (явный блок на slug)
- [ ] Wildcard DNS `*` → IP сервера
- [ ] HTTPS работает на `https://slug.домен.ru`
- [ ] Создан owner через `create-clinic`, не demo-пароли
- [ ] **Не загружайте реальные PHI** до миграции данных в БД (фаза B)

---

## Ограничения текущей версии

- **Учётки и клиники** — в PostgreSQL ✅  
- **Пациенты, записи, акты** — пока в браузере (`localStorage`) ⚠️  
  Для реальных пациентов нужна фаза B (API + PHI в БД).

---

## Ручной деплой (без Caddy в Docker)

```bash
npm ci && npm run build
npm run db:init
npm run create-clinic -- --slug ...
pm2 start npm --name dentalcloud -- start
```

Nginx (`/etc/nginx/sites-available/mis`):

```nginx
server {
    listen 80;
    server_name emkaro.ru *.emkaro.ru;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

SSL: `certbot --nginx -d emkaro.ru -d '*.emkaro.ru'` (нужна поддержка DNS wildcard или certbot dns plugin).

---

## 9.3. Очистка сервера (диск и Docker)

Не удаляет PostgreSQL (`pg-data`) и не трогает `.env`.

### Если на сервере **нет** `.git` (код залит архивом)

Сообщения `fatal: not a git repository` и `server-clean.sh: No such file` — нормальны. Скачайте скрипты с GitHub:

```bash
cd /opt/emkaro
mkdir -p scripts
curl -fsSL -o scripts/fetch-ops-scripts.sh \
  https://raw.githubusercontent.com/ClawedRex555-creator/dental-mental/main/scripts/fetch-ops-scripts.sh
bash scripts/fetch-ops-scripts.sh
```

Дальше:

```bash
bash scripts/server-clean.sh              # просмотр
bash scripts/server-clean.sh --apply      # очистка
bash scripts/server-clean.sh --apply --aggressive   # при нехватке места
```

Обновление кода без git: с Mac `bash scripts/deploy-to-server.sh` (соберёт tar и зальёт на сервер), затем на сервере:

```bash
bash scripts/server-update.sh /opt/emkaro-update.tar.gz
bash scripts/apply-migrations.sh
```

### Миграции БД

На сервере используйте **psql**, не `init-db.mjs` внутри контейнера app (избегает ошибки `08P01 invalid message format`):

```bash
cd /opt/emkaro
bash scripts/apply-migrations.sh
```

Только новая миграция (пример):

```bash
bash scripts/apply-migrations.sh 005-auth-login-global-unique.sql
```

Или вручную:

```bash
docker compose exec -T postgres psql -U mis -d dentalcloud -v ON_ERROR_STOP=1 \
  -c "CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_users_login_global ON auth_users (login);"
```

Перед уникальным индексом проверьте дубликаты email:

```bash
docker compose exec -T postgres psql -U mis -d dentalcloud -c \
  "SELECT login, COUNT(*) FROM auth_users GROUP BY login HAVING COUNT(*) > 1;"
```

### Если есть git-клон

```bash
cd /opt/emkaro
git pull origin main
bash scripts/server-clean.sh --apply
```

Скрипт удаляет:
- дубликаты `app/(dashboard)/…` (если остались после tar-деплоя);
- `/opt/emkaro-update.tar.gz`;
- старые SQL-бэкапы (по умолчанию оставляет 14 последних);
- неиспользуемый Docker build cache и остановленные контейнеры.

После очистки — обновление приложения:

```bash
bash scripts/server-update.sh
# или только пересборка:
docker compose up -d --build
```

---

## 9.4. Защита `.env` и устойчивый деплой

### `.dockerignore`

В репозитории есть `.dockerignore`: секреты (`.env`), бэкапы и `node_modules` **не попадают** в Docker build context.

### Нормализация `.env` на сервере

После каждого `server-update.sh` и при смене секрета подписи:

```bash
python3 scripts/fix-server-env.py /opt/emkaro/.env      # BOM, CRLF, emkao.u → emkaro.ru
python3 scripts/fix-server-env.py --check /opt/emkaro/.env
```

Скрипт `server-update.sh` вызывает это автоматически. При повреждённом домене деплой **останавливается** до исправления.

Проверка вручную:

```bash
grep '^APP_ROOT_DOMAIN=' /opt/emkaro/.env   # должно быть emkaro.ru, не emkao.u
grep '^ACME_EMAIL=' /opt/emkaro/.env
```

После правки `.env` всегда перезапускайте Caddy:

```bash
docker compose up -d --force-recreate caddy app
```

### Если `docker compose build` падает (npm/DNS на VPS)

```bash
cd /opt/emkaro
DEPLOY_USE_PREBUILT=1 bash scripts/server-update.sh /opt/emkaro-update.tar.gz
# или отдельно:
bash scripts/server-build-prebuilt.sh
```

Скрипт собирает `.next` в контейнере node на хосте (зеркало npmmirror) и упаковывает образ через `Dockerfile.prebuilt`.

При обычном деплое, если `docker compose build` не удался, `server-update.sh` **автоматически** пробует prebuilt path.

### Ротация `EGISZ_SIGNING_SECRET` с Windows

Используйте `scripts/rotate-signing-secret.ps1` или `sync-signing-secret.ps1` — они вызывают `fix-server-env.py` на сервере. Не редактируйте `.env` вручную через PowerShell без нормализации.

---

## Полезные команды

```bash
docker compose logs app
docker compose restart app
docker compose exec postgres psql -U mis -d dentalcloud -c "SELECT slug, name FROM clinics;"
curl https://emkaro.ru/api/health
curl https://ulybka.emkaro.ru/api/clinic/context
```
