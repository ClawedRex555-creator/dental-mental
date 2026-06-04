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
# OID Emkaro в НСИ ЕГИСЗ (справочник 1.2.643.2.69.1.2.*) — НЕ выдаётся N3 клинике
EGISZ_SYSTEM_ID=1.2.643.2.69.1.2.xxx
EGISZ_PRODUCT_NAME=Emkaro
EGISZ_N3_STUB=true              # legacy: не блокирует live у клиник с connectionMode=live
EGISZ_CRON_SECRET=...           # для POST /api/egisz/process
EGISZ_WEBHOOK_SECRET=...        # опционально для webhook
PHI_ENCRYPTION_KEY=...          # СНИЛС пациентов в БД
```

### Что такое `EGISZ_SYSTEM_ID`

| Параметр | Кто выдаёт | Пример |
|----------|------------|--------|
| **EGISZ_SYSTEM_ID** | Разработчик Emkaro — регистрация МИС в [НСИ ЕГИСЗ](https://nsi.rosminzdrav.ru) (OID ветки `1.2.643.2.69.1.2`) | `1.2.643.2.69.1.2.10` — только пример из документации N3, не копировать |
| GUID, idLPU, login/password | N3 — ЛК [lk.n3health.ru](https://lk.n3health.ru) | на каждое юр. лицо |
| OID организации (МО) | ФРМО / ЛК N3 | `1.2.643.5.1.13.13.12.2.61.*` |

N3 в тикете поддержки **не обязаны** выдавать SystemId: это OID **продукта Emkaro**, а не клиники. Клиника заполняет в Emkaro только свои N3-параметры.

Регистрация МИС: [api.n3med.ru](https://api.n3med.ru) → раздел про тестовый контур «МИС–РМИС–ЕГИСЗ».

### Multi-clinic (разные юр. лица)

| Уровень | Что хранится |
|---------|----------------|
| **Платформа** (`.env`) | `EGISZ_SYSTEM_ID` — OID информационной системы Emkaro |
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

1. Зарегистрировать **Emkaro** в НСИ → получить `EGISZ_SYSTEM_ID`, прописать в `.env` на сервере, `docker compose up -d --build app`
2. Регистрация **клиники** в ЛК N3 → GUID, idLPU, login/password
3. **OpenVPN** из ЛК N3 (например `b2b-makarova-1.ovpn`) — подключить на сервере или на машине, с которой идёт SOAP к demo
4. Включить модуль `egisz` для клиники: `/platform/admin` → клиника → модуль ЕГИСЗ
5. `tstom.emkaro.ru` → Настройки → N3 / ЕГИСЗ: live, OID организации, N3 credentials, URL demo
6. Добавить врача: СНИЛС, OID ФРМР, код должности
7. Медкарта с диагнозом → «Обработать очередь» или `POST /api/egisz/submit`
8. Совместное тестирование с N3
9. Промышленный контур — только после успешного теста на demo

### Пример: ИП Макарова (`tstom`)

Данные из ЛК N3 (проверьте актуальность в ЛК):

| Поле | Значение |
|------|----------|
| OID организации | `1.2.643.5.1.13.13.12.2.61.138304` |
| GUID | `1e5c8739-f89a-68df-40d4-496b29a943aa` |
| idLPU | `fcf8c67b-a4eb-4317-82d2-ad07fff55033` |
| SOAP (demo) | `http://b2b-demo.n3health.ru/emk/EMKService.svc` |
| Login | email из ЛК N3 |

В UI Emkaro: **Live**, контур **Тестовый**, включить интеграцию. `EGISZ_SYSTEM_ID` на сервере — отдельно (см. выше).

Проверка готовности (владелец клиники, залогинен):

```bash
curl -s "https://tstom.emkaro.ru/api/egisz/status" -b "dc_session=..."
```

Поле `missingForLive` должно быть пустым для live.

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
