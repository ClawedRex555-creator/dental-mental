# Деплой Emkaro с поддоменами

Каждая клиника — свой поддомен: `ulybka.emkaro.ru`, `zubki.emkaro.ru`.  
Корневой домен `emkaro.ru` — портал со списком клиник.

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
ENABLE_DEMO_ACCOUNTS=false
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

```bash
# PostgreSQL
docker compose exec postgres pg_dump -U mis dentalcloud > backup-$(date +%F).sql

# или скрипт
bash scripts/backup-db.sh
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
1. Делает дамп БД в `backups/`
2. Распаковывает код (`.env` сохраняется)
3. Пересобирает контейнер `app`

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
- [ ] `ENABLE_DEMO_ACCOUNTS=false`
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

## Полезные команды

```bash
docker compose logs app
docker compose restart app
docker compose exec postgres psql -U mis -d dentalcloud -c "SELECT slug, name FROM clinics;"
curl https://emkaro.ru/api/health
curl https://ulybka.emkaro.ru/api/clinic/context
```
