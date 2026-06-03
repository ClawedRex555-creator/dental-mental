# Интеграция Emkaro с N3.Health ИЭМК (ЕГИСЗ)

Подключение клиники к **N3.Health ИЭМК** для передачи данных в ЕГИСЗ (ИЭМК + РЭМД) по 140-ФЗ.

- Поставщик: [N3.Health](https://n3health.ru)
- API: https://api.n3health.ru/index.php
- Методы ИЭМК: https://api.n3health.ru/iemk/#minmet
- MedDocument: https://api.n3health.ru/iemk/#MedDocument
- ЛК: https://lk.n3health.ru → «Интегрированная электронная медицинская карта»

---

## Архитектура в коде

```
lib/egisz/
  types.ts              — конфиг клиники (N3 credentials, signing, document OID)
  db.server.ts          — очередь egisz_submissions, config
  worker.server.ts      — обработка queued → sent/error
  queue.server.ts       — постановка в очередь, autoSubmitSemd
  export.ts             — validatePatient, re-exports
  n3/
    client.ts           — SOAP-клиент AddPatient, AddMedRecord
    mappers.ts          — Patient/Doctor/Record → N3 DTO
    types.ts
  cda/
    builder.ts          — CDA R2 XML (протокол консультации / стомат. осмотр)
    constants.ts        — OID NSI
  signing/
    interface.ts
    stub.server.ts      — двойная КЭП-заглушка (dev / тест N3)
    cryptopro.server.ts — промышленный контур (TODO: CryptoPro CSP)
```

### API

| Маршрут | Назначение |
|---------|------------|
| `GET/PUT /api/egisz/config` | Настройки клиники + список отправок |
| `GET /api/egisz/status` | Готовность инфраструктуры |
| `POST /api/egisz/submit` | Ручная отправка medRecord / patient / reprocess submissionId |
| `POST /api/egisz/process` | Cron: обработка очереди (Bearer `EGISZ_CRON_SECRET`) |
| `POST /api/egisz/webhook` | Колбэки N3 (`x-egisz-webhook-token`) |

---

## Переменные окружения

```env
EGISZ_GATEWAY_URL=https://b2b-demo.n3health.ru/emk/EMKService.svc
EGISZ_ENV=test
EGISZ_SYSTEM_ID=...           # один ID информационной системы Emkaro (N3)
EGISZ_PRODUCT_NAME=Emkaro
EGISZ_N3_STUB=true              # legacy: не блокирует live у клиник с connectionMode=live
EGISZ_CRON_SECRET=...           # для POST /api/egisz/process
EGISZ_WEBHOOK_SECRET=...        # опционально для webhook
PHI_ENCRYPTION_KEY=...          # СНИЛС пациентов в БД
```

### Multi-clinic (разные юр. лица)

| Уровень | Что хранится |
|---------|----------------|
| **Платформа** (`.env`) | `EGISZ_SYSTEM_ID` — один ИС для продукта Emkaro |
| **Клиника** (`clinics.egisz_config`) | OID организации, N3 GUID/idLPU/login/password, режим stub/live, КЭП |
| **Очередь** (`egisz_submissions.clinic_id`) | Отправки изолированы по tenant |

Каждая клиника настраивает ЕГИСЗ **в своём поддомене** (`tstom.emkaro.ru` → Настройки). Credentials одной клиники **не применяются** к другой. Супер-админ видит сводку: `/platform/admin` → блок «ЕГИСЗ / N3».

В настройках клиники (`Настройки → N3 / ЕГИСЗ`) задаются:

- OID организации, OID типа CDA
- **Режим подключения:** `stub` (тест) | `live` (реальный N3 **этой** клиники)
- GUID МО, idLPU, login/password N3 (**свои для каждого юр. лица**)
- Режим подписи: `stub` | `cryptopro`
- **КЭП организации** (`orgCertThumbprint`) — в настройках клиники
- **КЭП врача** (`certThumbprint`) — в карточке каждого врача (Сотрудники)

---

## Поток отправки

1. Медкарта сохраняется → при `autoSubmitSemd` запись попадает в `egisz_submissions` (`queued`)
2. Worker (`processEgiszSubmissionWorker`):
   - валидация пациента, врача (СНИЛС, OID ФРМР, код должности), клиники, медкарты
   - сборка CDA (`buildCdaDocument`)
   - подпись двумя КЭП (`signCdaDocument`)
   - `AddPatient` → GUID пациента в N3
   - `AddMedRecord` + `MedDocument.DocumentAttachment` (base64 CDA)
3. Статус: `sent` | `error` | `accepted` (через webhook)

### Ручная отправка

```bash
curl -X POST https://tstom.emkaro.ru/api/egisz/submit \
  -H "Cookie: dc_session=..." \
  -H "Content-Type: application/json" \
  -d '{"medicalRecordId":"rec-..."}'
```

### Cron (очередь)

```bash
curl -X POST https://emkaro.ru/api/egisz/process \
  -H "Authorization: Bearer $EGISZ_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"limit":10}'
```

---

## Обязательные данные

### Пациент
Фамилия, имя, дата рождения, **СНИЛС**

### Врач (карточка сотрудника)
**СНИЛС**, **OID ФРМР**, **код должности** (NSI 1.2.643.5.1.13.13.11.1002), **отпечаток КЭП** (для CryptoPro)

### Клиника
Название, ИНН, OID организации, GUID/idLPU N3

### Согласие
`patient_consents.consent_type = egisz_transfer` или документ «Отказ от ЕГИСЗ» в юр. отделе

---

## Тестирование с N3

1. Регистрация в ЛК N3, получение GUID, idLPU, login/password
2. Заполнить настройки в Emkaro, `EGISZ_N3_STUB=false`
3. Добавить врача с полями ЕГИСЗ
4. Создать медкарту с диагнозом
5. `POST /api/egisz/submit` или «Обработать очередь» в настройках
6. Совместное тестирование с N3
7. Финальный тест: **реальный** случай + подписанный CDA + заявка в техподдержку N3 из ЛК
8. Промышленный контур — только после успешного теста

---

## Stub-режим

При `connectionMode=stub` или неполных N3 credentials **этой клиники**:

- CDA собирается и подписывается stub-КЭП
- `AddPatient` / `AddMedRecord` возвращают `STUB-PAT-*` / `STUB-DOC-*`
- Подходит для проверки очереди и UI до подключения SOAP

---

## Промышленный контур (CryptoPro)

1. Установить КриптоПро CSP на сервере приложения
2. `signing.mode = cryptopro` в настройках клиники
3. `orgCertThumbprint` — в настройках ЕГИСЗ; `certThumbprint` — у каждого врача в карточке
4. Доработать `lib/egisz/signing/cryptopro.server.ts` под ваш CLI/CAdES API

---

## Модуль в SaaS

Модуль `egisz` включается супер-админом: `/platform/admin` (5 кликов по логотипу на emkaro.ru).
