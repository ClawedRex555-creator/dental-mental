# Emkaro: установка на Timeweb Cloud (3 шага)

Инструкция для быстрых тестов по **IP** (`http://ВАШ_IP:3000`).  
Домен **emkaro.ru** подключите позже — [EMKARO-RU.md](./EMKARO-RU.md).

---

## Шаг 1. Создать сервер в Timeweb

1. Зайдите на [timeweb.cloud](https://timeweb.cloud) → войдите в аккаунт.
2. **Облачные серверы** → **Создать сервер**.
3. Параметры:
   - **ОС:** Ubuntu 22.04
   - **RAM:** 2 GB (или 2 GB + 1 vCPU)
   - **Диск:** 20–30 GB NVMe
   - **Регион:** любой (ближе к вам)
4. Оплатите и дождитесь статуса **«Запущен»**.
5. Запишите:
   - **Публичный IP** (например `85.234.12.34`)
   - **root** + **пароль** (или SSH-ключ)

### Открыть порт 3000 (обязательно)

1. В карточке сервера → **Сеть** / **Firewall** / **Группы безопасности**.
2. Добавьте правило **входящее**:
   - Протокол: **TCP**
   - Порт: **3000**
   - Источник: **0.0.0.0/0** (или «все»)
3. Убедитесь, что открыт **22** (SSH) — обычно уже есть.

> Без порта 3000 сайт с вашего компьютера не откроется.

---

## Шаг 2. Загрузить проект на сервер

### 2а. Архив на Windows

На **вашем ПК** в PowerShell:

```powershell
cd "C:\Users\Мой компьютер\Desktop\dentalcloud-mis"
powershell -ExecutionPolicy Bypass -File scripts\pack-for-server.ps1
```

Появится файл **`emkaro-deploy.zip`** (рядом с проектом).

### 2б. WinSCP

1. Скачайте [WinSCP](https://winscp.net/ru/download.php).
2. Новое подключение:
   - Протокол: **SFTP**
   - Хост: **ваш IP**
   - Пользователь: **root**
   - Пароль: из Timeweb
3. Слева — ваш ПК, справа — сервер.
4. Справа откройте `/opt/` (создайте папку, если нет).
5. Перетащите **`emkaro-deploy.zip`** в `/opt/`.

### 2в. Консоль Timeweb (без WinSCP)

В панели сервера → **Консоль** / **VNC**:

```bash
cd /opt
apt update && apt install -y unzip
# если zip уже загружен через файловый менеджер Timeweb:
unzip -o emkaro-deploy.zip -d emkaro
cd emkaro
ls
# должны быть: package.json, docker-compose.quick.yml, scripts/
```

Если распаковали в `/opt/emkaro-deploy/` — зайдите в эту папку.

---

## Шаг 3. Установка одной командой

В консоли сервера:

```bash
cd /opt/emkaro
# или: cd /opt/emkaro-deploy  — куда распаковали

chmod +x scripts/quick-deploy.sh
bash scripts/quick-deploy.sh
```

> `sudo` не обязателен, если вы под **root**.

Скрипт **5–15 минут** (первый раз качает Docker и собирает образ).

В конце увидите:

```text
http://85.234.12.34:3000/login
Логин:  admin@demo.ru
Пароль: DemoTest123!
```

### Проверка

Откройте в браузере на телефоне/ПК:

`http://ВАШ_IP:3000/login`

| Email | Пароль |
|-------|--------|
| admin@demo.ru | DemoTest123! |

---

## Что отправить тестировщикам

```text
Emkaro — тестовый вход
Ссылка: http://ВАШ_IP:3000/login
Логин: admin@demo.ru
Пароль: DemoTest123!

Используйте выдуманных пациентов, без реальных СНИЛС.
```

---

## Если не открывается

| Проверка | Как |
|----------|-----|
| Порт 3000 | Timeweb → Firewall → правило TCP 3000 |
| Контейнеры | `docker compose -f docker-compose.quick.yml ps` — app и postgres **Up** |
| Логи | `docker compose -f docker-compose.quick.yml logs app --tail 80` |
| IP верный | Тот же, что в панели Timeweb |

Перезапуск:

```bash
cd /opt/emkaro
docker compose -f docker-compose.quick.yml up -d --build
```

---

## Сменить пароль после тестов

```bash
docker compose -f docker-compose.quick.yml exec app node scripts/create-clinic.mjs \
  --slug demo \
  --name "Моя клиника" \
  --email owner@emkaro.ru \
  --password 'НовыйСильныйПароль123' \
  --owner-name "Владелец"
```

(Если slug `demo` занят — используйте `--slug test` и в `.env` поставьте `DEFAULT_CLINIC_SLUG=test`.)

---

## Дальше: домен emkaro.ru

Когда тесты по IP прошли:

1. DNS: `@` и `*` → IP сервера (в Reg.ru, где купили домен).
2. На сервере: `docker compose -f docker-compose.quick.yml down`
3. Настроить `.env` по `.env.example` (`APP_ROOT_DOMAIN=emkaro.ru`)
4. `docker compose up -d --build`
5. Вход: **https://demo.emkaro.ru/login**

Подробно: [EMKARO-RU.md](./EMKARO-RU.md)

---

## Чеклист

- [ ] Сервер Timeweb Ubuntu 2 GB — запущен
- [ ] IP записан
- [ ] Порт **3000** открыт в firewall
- [ ] `emkaro-deploy.zip` в `/opt/`, распакован
- [ ] `bash scripts/quick-deploy.sh` — без ошибок
- [ ] `http://IP:3000/login` открывается
- [ ] Вход работает
