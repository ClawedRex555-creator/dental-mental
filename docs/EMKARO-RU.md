# Подключение домена emkaro.ru

Пошаговая инструкция после покупки домена.

---

## Как это будет работать

| Адрес | Назначение |
|-------|------------|
| **https://emkaro.ru** | Главная: список клиник |
| **https://demo.emkaro.ru/login** | Вход в клинику «demo» (пример) |
| **https://ulybka.emkaro.ru/login** | Другая клиника (когда создадите) |

---

## Шаг 1. DNS у регистратора (где купили emkaro.ru)

Нужен **IP вашего VPS** (из панели Timeweb / Reg.ru / Selectel).

В разделе **DNS / Управление зоной** добавьте записи:

| Тип | Имя (хост) | Значение |
|-----|------------|----------|
| **A** | `@` | `123.45.67.89` ← ваш IP |
| **A** | `*` | `123.45.67.89` ← тот же IP |
| **A** | `www` | `123.45.67.89` ← тот же IP (по желанию) |

- `@` — это сам **emkaro.ru**
- `*` — любой поддомен: **demo.emkaro.ru**, **ulybka.emkaro.ru**
- Обновление DNS: от **15 минут до 24 часов**

Проверка (с компьютера):

```bash
nslookup emkaro.ru
nslookup demo.emkaro.ru
```

Оба должны показать ваш IP.

### Reg.ru (частый случай)

1. Домены → **emkaro.ru** → **DNS-серверы и управление зоной**
2. Если зона пустая — «Добавить запись» → тип **A**
3. Поддомен оставить пустым или `@` для корня
4. Для `*` — в поле «Поддомен» иногда пишут `*` или `*.emkaro.ru` (смотрите подсказку Reg.ru)

---

## Шаг 2. Сервер (VPS)

Минимум: **Ubuntu 22.04**, **2 GB RAM**, порты **80** и **443** открыты в firewall.

```bash
# Порты для HTTPS (обязательно для emkaro.ru)
# 80  — проверка Let's Encrypt
# 443 — сайт
```

Порт **3000** для быстрого теста по IP больше не нужен, если идёте через домен.

---

## Шаг 3. Установка Emkaro на сервер

```bash
cd /opt
# загрузите проект (git clone или zip)
cd emkaro   # или dentalcloud-mis — как назвали папку

cp .env.example .env
nano .env
```

Заполните **`.env`**:

```env
NODE_ENV=production
AUTH_SECRET=вставьте-длинную-случайную-строку
APP_ROOT_DOMAIN=emkaro.ru
ACME_EMAIL=ваш@email.ru
POSTGRES_PASSWORD=сильный-пароль-базы
ENABLE_DEMO_ACCOUNTS=false
```

Сгенерировать секрет (на сервере):

```bash
openssl rand -base64 48
```

Запуск **с HTTPS и поддоменами**:

```bash
docker compose up -d --build
```

Подождите 2–5 минут. Caddy сам получит SSL-сертификат для `emkaro.ru` и `*.emkaro.ru`.

Логи:

```bash
docker compose logs -f caddy
docker compose logs -f app
```

---

## Шаг 4. Первая клиника

```bash
docker compose exec app node scripts/create-clinic.mjs \
  --slug demo \
  --name "Тестовая клиника" \
  --email admin@demo.ru \
  --password 'ВашНадёжныйПароль123!' \
  --owner-name "Администратор"
```

Вход для сотрудников:

**https://demo.emkaro.ru/login**

---

## Шаг 5. Проверка

1. **https://emkaro.ru** — главная Emkaro, список клиник  
2. **https://demo.emkaro.ru/login** — форма входа  
3. Войти с email и паролем из шага 4  

---

## Если раньше тестировали по IP (:3000)

Остановите быстрый вариант и перейдите на домен:

```bash
docker compose -f docker-compose.quick.yml down
docker compose up -d --build
```

В `.env` должно быть `APP_ROOT_DOMAIN=emkaro.ru`, без `DEFAULT_CLINIC_SLUG` (или закомментируйте — он только для IP).

---

## Вторая клиника

```bash
docker compose exec app node scripts/create-clinic.mjs \
  --slug ulybka \
  --name "Стоматология Улыбка" \
  --email owner@ulybka.ru \
  --password 'ДругойПароль123!' \
  --owner-name "Владелец"
```

Адрес: **https://ulybka.emkaro.ru/login**

---

## Частые проблемы

| Проблема | Решение |
|----------|---------|
| «Сайт не открывается» | DNS ещё не обновился; проверьте A-записи и IP |
| «Клиника не найдена» | Создайте клинику через `create-clinic` с тем же **slug**, что в поддомене |
| Нет HTTPS / ошибка сертификата | Порты 80 и 443 открыты? DNS уже указывает на сервер? |
| `www.emkaro.ru` не работает | Добавьте A-запись для `www` |
| Вход только на emkaro.ru без поддомена | Нужен **demo.emkaro.ru**, не корень |

---

## Чеклист

- [ ] A-записи `@` и `*` → IP VPS  
- [ ] Порты 80, 443 открыты  
- [ ] `.env`: `APP_ROOT_DOMAIN=emkaro.ru`, `ACME_EMAIL` ваш email  
- [ ] `docker compose up -d --build`  
- [ ] `create-clinic` выполнен  
- [ ] Открывается https://demo.emkaro.ru/login  

---

## Почта на домене (необязательно)

`admin@emkaro.ru` в `.env` — только для **Let's Encrypt**, почтовый ящик создавать не обязательно. Можно указать любой ваш реальный email (Gmail и т.д.).
