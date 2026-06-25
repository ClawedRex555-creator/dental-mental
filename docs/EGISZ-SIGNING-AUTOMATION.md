# ЕГИСЗ: автозапуск без ручных туннелей

Пошаговая настройка «один раз — потом только PIN Rutoken при подписи».

## Схема

```
[Windows ПК клиники]                    [Сервер Emkaro]
  Rutoken + КриптоПро                      Docker app
  агент :9876  ──SSH -R──►  127.0.0.1:9876 ──socat──► 172.17.0.1:9876
  (автозапуск)                             OpenVPN ──► N3 demo
```

---

## Шаг 1. Windows — станция подписи

### 1.1 Скопировать файлы

Скопируйте `scripts/egisz-signing-agent/` в `C:\emkaro-signing\`:

- `server.mjs`
- `config.example.env` → переименовать в `config.env`
- `run-agent.ps1`, `run-tunnel.ps1`, `install-windows-tasks.ps1`
- `list-certs.ps1`, `start-windows.bat` (опционально)

### 1.2 Заполнить `C:\emkaro-signing\config.env`

```env
EGISZ_SIGNING_SECRET=тот-же-секрет-что-в-opt-emkaro-env
EMKARO_SSH_HOST=root@201.51.0.171
```

### 1.3 SSH-ключ (чтобы туннель не спрашивал пароль)

На Windows PowerShell:

```powershell
ssh-keygen -t ed25519 -N '""' -f $env:USERPROFILE\.ssh\id_ed25519
type $env:USERPROFILE\.ssh\id_ed25519.pub
```

На сервере:

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
nano ~/.ssh/authorized_keys   # вставить строку pubkey
chmod 600 ~/.ssh/authorized_keys
```

### 1.4 Установить автозапуск

PowerShell **от администратора**:

```powershell
cd C:\emkaro-signing
powershell -ExecutionPolicy Bypass -File .\install-windows-tasks.ps1
Start-ScheduledTask -TaskName EmkaroSigningAgent
Start-ScheduledTask -TaskName EmkaroSigningTunnel
```

Проверка на ПК:

```powershell
Invoke-RestMethod http://127.0.0.1:9876/health
```

Логи: `C:\emkaro-signing\logs\agent.log`, `tunnel.log`

**Важно:** PIN Rutoken вводится на этом ПК при «Обработать очередь». ПК должен быть включён и пользователь залогинен.

---

## Шаг 2. Сервер — VPN N3 и проброс порта

SSH на сервер:

```bash
cd /opt/emkaro
bash scripts/install-egisz-server-services.sh
```

Проверка:

```bash
curl -s http://172.17.0.1:9876/health    # после туннеля с Windows
bash scripts/n3-vpn.sh test               # n3: HTTP 200
```

В `/opt/emkaro/.env`:

```env
EGISZ_SIGNING_URL=http://172.17.0.1:9876/sign
EGISZ_SIGNING_SECRET=тот-же-секрет
```

```bash
docker compose up -d --force-recreate app
```

---

## Шаг 3. Четыре врача — отпечатки в Emkaro

Для **каждого** врача: **Сотрудники → врач → ЕГИСЗ / N3**

| Поле | Обязательно |
|------|-------------|
| СНИЛС | да |
| OID ФРМР | да |
| Код должности (NSI) | да |
| **Отпечаток КЭП врача** | да (свой у каждого) |

В **Настройки → N3 / ЕГИСЗ**: один **отпечаток КЭП организации**.

Все сертификаты должны быть доступны на ПК `C:\emkaro-signing` (один Rutoken с несколькими контейнерами или все контейнеры установлены на станции).

Список сертификатов:

```powershell
powershell -ExecutionPolicy Bypass -File C:\emkaro-signing\list-certs.ps1
```

При отправке СЭМД Emkaro берёт врача из **медзаписи** → его `certThumbprint` → агент подписывает этим сертификатом.

---

## Шаг 4. Ежедневная работа

1. ПК подписи включён (задачи стартуют при входе).
2. Rutoken вставлен.
3. В tstom: медзапись с диагнозом → **Обработать очередь**.
4. Ввести PIN (1–2 раза).

---

## Диагностика

| Симптом | Решение |
|---------|---------|
| `Connection refused` на `172.17.0.1:9876` | Туннель с Windows: `Start-ScheduledTask EmkaroSigningTunnel` |
| `fetch failed` | То же + VPN: `systemctl start emkaro-n3-vpn` |
| `timeout` при подписи | PIN на экране Windows |
| Неверный сертификат | Проверить отпечаток в карточке врача и `list-certs.ps1` |

---

## Дальше (этап 2)

- WireGuard вместо SSH-туннеля (постоянная сеть клиника ↔ сервер).
- КриптоПро DSS — подпись без USB (промышленный контур).

См. также [CRYPTOPRO-WINDOWS.md](./CRYPTOPRO-WINDOWS.md), [N3-OPENVPN.md](./N3-OPENVPN.md).
