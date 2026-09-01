# Интеграция F.Doc (подготовка)

Emkaro поддерживает **два провайдера** подписи документов пациентом:

| Провайдер | Env | SMS шлёт |
|-----------|-----|----------|
| **Emkaro** (по умолчанию) | `DOCUMENT_SIGN_PROVIDER=emkaro` | ваш SMS-шлюз + страница `/sign` |
| **F.Doc** | `DOCUMENT_SIGN_PROVIDER=fdoc` + `FDOC_*` | F.Doc (в тарифе) |

Пока нет ключей F.Doc — работает Emkaro. После заявки на [fdoc.ru/integration/api](https://fdoc.ru/integration/api/) переключаетесь одной переменной.

## Чеклист подключения F.Doc

### 1. Договор и доступ

1. [Заявка на сайте F.Doc](https://fdoc.ru/integration/api/) → установочная встреча.
2. Договор / оферта, оплата тарифа.
3. На email приходит **API Key** (20 символов), **login**, **password**.
4. Тестовая среда (sandbox) для отладки.
5. В личном кабинете F.Doc:
   - зарегистрировать **юрлицо** клиники;
   - зарегистрировать **сотрудников** (кто отправляет документы);
   - при необходимости — **ID сотрудника** для API (`FDOC_EMPLOYEE_ID`).

### 2. Переменные на сервере

```env
DOCUMENT_SIGN_PROVIDER=fdoc

FDOC_API_URL=https://…          # из документации партнёра (prod / test)
FDOC_API_KEY=…………………………
FDOC_LOGIN=…
FDOC_PASSWORD=…

# Webhook: F.Doc дергает Emkaro при подписи
FDOC_WEBHOOK_SECRET=…             # общий секрет в заголовке x-fdoc-signature

# Опционально
FDOC_EMPLOYEE_ID=…                # отправитель пакета в F.Doc
FDOC_TEST_MODE=1                  # тестовая среда
FDOC_CRON_SECRET=…                # опрос pending, если webhook недоступен

APP_PUBLIC_BASE_URL=https://ваша-клиника.emkaro.ru
```

Перезапуск:

```bash
docker compose up -d --force-recreate app
```

Миграции (если ещё не были):

```bash
docker compose exec app node scripts/init-db.mjs --migrations-only
```

Нужны `015-document-sign-requests.sql` и `016-document-sign-fdoc.sql`.

### 3. Webhook

URL для регистрации в F.Doc (или в теле create package):

```text
https://ваша-клиника.emkaro.ru/api/document-sign/fdoc-webhook
```

Emkaro ожидает JSON с полями (уточнить по их доке):

```json
{
  "packageId": "…",
  "status": "signed",
  "signedAt": "2026-08-30T12:00:00Z",
  "signedDocumentUrl": "https://…"
}
```

Заголовок: `x-fdoc-signature: {FDOC_WEBHOOK_SECRET}` (если секрет задан).

### 4. Опрос статуса (fallback)

Если webhook не настроен, cron раз в 5–15 мин:

```bash
curl -X POST https://ваша-клиника.emkaro.ru/api/document-sign/fdoc-sync \
  -H "Authorization: Bearer $FDOC_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Или из UI (сотрудник): `POST /api/document-sign/fdoc-sync` с `{ "requestId": "uuid" }`.

### 5. UI в Emkaro

«Пациент пришёл — документы» → кнопка **«Отправить на подпись (F.Doc)»** (если `DOCUMENT_SIGN_PROVIDER=fdoc`).

Пациент получает SMS **от F.Doc**, подписывает на их странице. Emkaro получает статус через webhook/cron и пишет согласия в `patient_consents`.

## Архитектура в коде

| Компонент | Путь |
|-----------|------|
| Клиент REST | `lib/document-sign/fdoc/client.server.ts` |
| Webhook + sync | `lib/document-sign/fdoc/webhook.server.ts` |
| Конфиг env | `lib/document-sign/fdoc/config.server.ts` |
| PDF (TODO) | `lib/document-sign/fdoc/documents.server.ts` |
| Переключатель | `DOCUMENT_SIGN_PROVIDER`, `resolveDocumentSignProvider()` |
| API | `POST …/send`, `POST …/fdoc-webhook`, `POST …/fdoc-sync`, `GET …/config` |

## Что доработать после получения REST API от F.Doc

Публичной OpenAPI нет — после выдачи документации правим:

1. **`FDOC_API_PATHS`** в `client.server.ts` — реальные пути (`/packages`, `/documents`, …).
2. **`buildCreatePackageBody`** — точная структура JSON.
3. **`parseCreateResponse` / `parseStatusResponse`** — поля ответа.
4. **`documents.server.ts`** — сборка PDF из юр. шаблонов Emkaro (`arrival-documents`, `legal-pdf-fill`) в base64 для F.Doc.
5. **Webhook payload** — маппинг полей под их формат.

## Переключение обратно на Emkaro

```env
DOCUMENT_SIGN_PROVIDER=emkaro
NOTIFICATIONS_SMS_API_URL=…
NOTIFICATIONS_SMS_API_KEY=…
```

SMS и `/sign` снова работают без F.Doc.

## См. также

- [DOCUMENT-SMS-SIGNING.md](./DOCUMENT-SMS-SIGNING.md) — собственная SMS-подпись
- [patient-notifications.md](./patient-notifications.md) — SMS для напоминаний о записях
