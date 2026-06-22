# Тестовый контур N3 + CryptoPro на Windows

Краткая инструкция для проверки **live N3 demo** с реальной подписью КЭП на этом ПК.

## Что уже есть на машине

- КриптоПро CSP 5.0 (`csptest.exe`, без `cryptcp.exe` — это нормально)
- Rutoken с КЭП
- Node.js

## 1. Отпечатки КЭП

```powershell
cd scripts\egisz-signing-agent
powershell -ExecutionPolicy Bypass -File list-certs.ps1
```

Актуальные сертификаты (проверьте дату «Expires» в выводе):

| Роль | Отпечаток (SHA1) | Кому |
|------|------------------|------|
| Организация (ООО «Грант») | `F5E71B41F16AFC5F330815D1E6BBFE08389E6C3F` | Настройки → N3 / ЕГИСЗ |
| Врач (ИП Макарова) | `4B2BA8761E3CCD97E368D94F40F9068E884A7F99` | Сотрудники → врач → ЕГИСЗ |
| Врач (физлицо, IT-COM) | `A98A34777AF2B0A443621A0E3A056D4834E8A398` | альтернатива |

## 2. Агент подписи (этот ПК)

В **cmd** (не PowerShell, если блокируется npm):

```bat
cd scripts\egisz-signing-agent
set EGISZ_SIGNING_SECRET=ваш-длинный-секрет
set EGISZ_SIGNING_PORT=9876
set CRYPTOPRO_CSPTEST=C:\Program Files\Crypto Pro\CSP\csptest.exe
node server.mjs
```

Проверка:

```bat
curl http://127.0.0.1:9876/health
```

Ожидание: `"ok":true,"signTool":"csptest"`.

## 3. Emkaro — переменные

### Локальный dev (`npm run dev` на этом же ПК)

Создайте `.env.local`:

```env
EGISZ_GATEWAY_URL=http://b2b-demo.n3health.ru/emk/EMKService.svc
EGISZ_ENV=test
EGISZ_N3_STUB=false
EGISZ_SIGNING_URL=http://127.0.0.1:9876/sign
EGISZ_SIGNING_SECRET=тот-же-секрет-что-на-агенте
```

### Сервер (tstom.emkaro.ru)

В `/opt/emkaro/.env` на сервере — **IP этого Windows-ПК** вместо 127.0.0.1:

```env
EGISZ_SIGNING_URL=http://ВАШ_IP_В_СЕТИ:9876/sign
EGISZ_SIGNING_SECRET=тот-же-секрет
```

Разрешите входящий TCP **9876** в брандмауэре Windows.

## 4. Настройки клиники в UI

**Настройки → N3 / ЕГИСЗ:**

| Поле | Значение |
|------|----------|
| Интеграция | Включена |
| Подключение | **Live** |
| Контур | **Тестовый** |
| URL шлюза | `http://b2b-demo.n3health.ru/emk/EMKService.svc` |
| Подпись | **CryptoPro** |
| OID организации | из ЛК N3 (пример: `1.2.643.5.1.13.13.12.2.61.138304`) |
| GUID, idLPU, login, password | из [ЛК N3](https://lk.n3health.ru) |
| Отпечаток КЭП организации | см. таблицу выше |

**Сотрудники → врач:**

- СНИЛС, OID ФРМР, код должности (NSI)
- Отпечаток КЭП врача

**Пациент:** ФИО, дата рождения, СНИЛС.

## 5. OpenVPN N3

Для **live** SOAP к `b2b-demo.n3health.ru` нужен VPN из ЛК N3:

- на **сервере** Emkaro — если отправка с сервера;
- на **этом ПК** — если тестируете локально `npm run dev`.

Без VPN ошибка будет `fetch failed` при AddPatient/AddMedRecord.

## 6. Отправка СЭМД

1. Сохраните медкарту с диагнозом (или включите «Автоматически ставить СЭМД в очередь»).
2. **Настройки → N3 / ЕГИСЗ → Обработать очередь**.
3. Статус `sent` + реальный ID от N3 (не `STUB-DOC-*`).

Проверка готовности: `GET /api/egisz/status` — поле `missingForLive` должно быть пустым.

## Частые ошибки

| Ошибка | Причина |
|--------|---------|
| `stub не подходит для AddMedRecord` | Live + подпись Stub — переключите на CryptoPro |
| `fetch failed` | Нет OpenVPN к N3 demo |
| `EGISZ_SIGNING_URL` | Агент не запущен или сервер не видит Windows по сети |
| `Unauthorized` | Разные секреты на агенте и в `.env` |
| `csptest exit …` | Неверный отпечаток, флешка не вставлена, истёк сертификат |

Подробнее: [CRYPTOPRO-WINDOWS.md](./CRYPTOPRO-WINDOWS.md), [EGISZ-INTEGRATION.md](./EGISZ-INTEGRATION.md).
