# Emkaro Sign — интеграция в МИС

## Роли

| Система | Ответственность |
|---------|-----------------|
| **Emkaro MIS** | Инициация пакета, PDF, ручная SMS с телефона клиники, отображение статусов |
| **Emkaro Sign** | Юридическая проверка, ПЭП, ссылка, OTP, evidence |
| **MIS** | Не SMS-провайдер; не генерирует ПЭП; не пишет «SMS доставлено» |

## Env

```env
DOCUMENT_SIGN_PROVIDER=emkaro_sign
EMKARO_SIGN_API_URL=
EMKARO_SIGN_API_KEY=
EMKARO_SIGN_WEBHOOK_SECRET=
EMKARO_SIGN_TENANT_MAP={"tstom":{"organizationId":"…","clinicId":"…"}}
# Dev only (запрещено в production):
# EMKARO_SIGN_MOCK=1
```

## Staff SSO (вход в Sign через Emkaro)

Кнопка «Войти через Emkaro» на Sign:

1. Sign → `https://{slug}.emkaro.ru/api/auth/emkaro-sign/sso?redirect_uri=…/api/auth/callback&state=…`
2. Если нет сессии МИС → `/login?from=…`, затем снова SSO
3. МИС выпускает короткий JWT (HMAC с `EMKARO_SIGN_WEBHOOK_SECRET`) с `organizationId`/`clinicId` из tenant map
4. Redirect на Sign callback → сессия Sign

На Sign тот же секрет: `EMKARO_WEBHOOK_SECRET`. `EMKARO_SIGN_API_URL` должен совпадать с origin Sign (проверка `redirect_uri`).

Модуль супер-админки: `document_sign`.

## Поток

1. Админ: «Пациент пришёл» → документы → **Отправить на подпись** → confirm.
2. MIS → Sign: импорт PDF + создание пакета (`deliveryMode=clinic_device`).
3. Sign возвращает `packageId`, `publicSignUrl`, `smsText`.
4. MIS создаёт `ClinicSmsSendTask`.
5. Телефон клиники (`/sign/sender-device`) получает задачу → `sms:` URI → сотрудник сам жмёт Send.
6. `MANUAL_SEND_CONFIRMED` (не DELIVERED).
7. Webhook Sign → статусы в `document_sign_requests` (`signatureStatus`, `signPackageId`, …).
8. Отмена: `POST /api/document-sign/cancel` (пока пакет не SIGNED).

## API

| Направление | Endpoint |
|-------------|----------|
| MIS → Sign | `SignIntegrationClient` (`lib/document-sign/emkaro-sign/integration-client.server.ts`) |
| Sign → MIS webhook | `POST /api/integration/sign/webhook` (+ alias `/api/webhooks/emkaro-sign`) |
| Pairing | `POST /api/clinic/sign-sender/devices`, `POST /api/sign/sender-device/pair` |
| Tasks на телефоне | `GET/POST /api/sign/sender-device/tasks` |
| Staff SMS status | `GET /api/clinic/sign-sender/tasks?packageId=` |
| Cancel package | `POST /api/document-sign/cancel` |

## Тесты

```bash
npm run test:sign
# или в составе:
npm run test:security
```

Покрыто (§26): tenant A≠B, pairing invalid/expired/replay, rate-limit, transitions / manual confirm, webhook HMAC / stale / events, idempotency key, cancel after SIGNED, production mock guard, e2e-логика mock flow.

## Definition of Done (МИС)

- [x] Sign API client + mock (non-prod)
- [x] Пакет создаётся → `ClinicSmsSendTask`
- [x] Pairing телефона клиники
- [x] SMS task на устройстве → composer → `MANUAL_SEND_CONFIRMED`
- [x] Webhook SIGNED / expired / cancelled / failed
- [x] Статусы + cancel в карточке пациента
- [x] Tenant / pairing / webhook unit + e2e-logic tests
- [x] Production: mock запрещён; unpaired device → 401; URL redact в логах
- [ ] Live Sign отдаёт `publicSignUrl`/`smsText` при `deliveryMode=clinic_device` (сторона Sign)
- [ ] Ручной прогон на demo/tstom после миграции `018`

См. также: [CLINIC_SMS_SENDER.md](./CLINIC_SMS_SENDER.md), [SIGN_WEBHOOKS.md](./SIGN_WEBHOOKS.md), [PAIRING_SECURITY.md](./PAIRING_SECURITY.md).
