# Clinic SMS Sender

Ручная отправка SMS с телефона клиники для Emkaro Sign.

## Сущности

- `clinic_sign_sender_devices` — привязанное устройство (заявленный номер + device token).
- `clinic_sign_pairing_tokens` — одноразовый QR/код, TTL 5 мин.
- `clinic_sms_send_tasks` — задача с `smsText` и `publicSignUrl` от Sign.

## Статусы задачи

`CREATED` → `WAITING_FOR_DEVICE` → `PRESENTED_TO_DEVICE` → `SMS_COMPOSER_OPENED` → `MANUAL_SEND_CONFIRMED`

Также: `CANCELLED`, `EXPIRED`, `FAILED`.

**Нет статуса DELIVERED** — нет receipt оператора.

## UI

- Настройки → Emkaro Sign — телефон клиники (`SignSenderSettingsPanel`).
- Телефон: `/sign/sender-device` (responsive / PWA-friendly).
  Публичный URL без входа в МИС, например `https://{slug}.emkaro.ru/sign/sender-device?code=123456`.
  Относительный путь `/sign/...` на телефоне не открывается — нужна полная ссылка.
- Карточка пациента: статус пакета + SMS-задачи + «Отменить пакет».

## Desktop формулировки

- «Пакет создан»
- «Передано на телефон клиники»
- «Сотрудник подтвердил отправку SMS»

Не писать: «SMS доставлено пациенту».

## Включение

1. `npm run db:init` (миграция `018`).
2. Модуль `document_sign` в супер-админке.
3. `DOCUMENT_SIGN_PROVIDER=emkaro_sign` + `EMKARO_SIGN_*`.
4. Привязать телефон в настройках.
5. Dev без Sign: `EMKARO_SIGN_MOCK=1` (в production запрещён).
