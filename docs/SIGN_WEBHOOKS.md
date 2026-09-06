# Sign webhooks → Emkaro MIS

`POST /api/integration/sign/webhook`  
Alias: `POST /api/webhooks/emkaro-sign`

## Проверки

- HMAC-SHA256 hex сырого тела (`X-Emkaro-Signature`, секрет `EMKARO_SIGN_WEBHOOK_SECRET`)
- Окно timestamp ±5 минут
- Idempotency по `eventId` (`emkaro_sign_webhook_events`)

## События

- `signature.package.created`
- `signature.package.opened`
- `signature.document.opened`
- `signature.package.awaiting_confirmation`
- `signature.package.signed` → status `signed` + consents + audit
- `signature.package.expired` / `cancelled` / `failed`

## Хранение статуса

Не только boolean: `signature_status`, `signature_method`, `sign_package_id`, `sign_operation_id`, `last_sign_sync_at`, `signed_at`.
