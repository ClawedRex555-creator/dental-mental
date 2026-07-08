# Уведомления пациентов о записи

Модуль **«Уведомления»** (`/notifications`) напоминает пациентам о предстоящем приёме через каналы связи.

## Как это работает

1. Супер-админ включает модуль `notifications` для клиники.
2. Владелец/админ включает уведомления в разделе **Уведомления → Настройки**.
3. В карточке пациента отмечается **согласие на сервисные уведомления** (152-ФЗ).
4. При создании/изменении записи (PUT `/api/clinic/data`) планируются отправки в таблицу `notification_deliveries`.
5. Cron вызывает `POST /api/notifications/process` — очередь обрабатывается провайдерами.

```mermaid
flowchart LR
  UI[Раздел Уведомления] --> API[API /api/notifications/*]
  Save[Сохранение записи] --> Hook[maybeSyncAppointmentNotifications]
  Hook --> Queue[(notification_deliveries)]
  Cron[Cron Bearer secret] --> Process[/api/notifications/process]
  Process --> Queue
  Process --> Providers[Telegram / SMS / Email / Mock]
```

## Архитектура (provider pattern)

| Компонент | Файл |
|-----------|------|
| Типы и настройки | `lib/notifications/types.ts`, `defaults.ts` |
| Шаблоны | `lib/notifications/template-service.ts` |
| Планировщик | `lib/notifications/scheduler.server.ts` |
| Отправка | `lib/notifications/dispatch.server.ts` |
| Очередь/cron | `lib/notifications/worker.server.ts` |
| Провайдеры | `lib/notifications/providers/*.server.ts` |

Расширение: реализуйте `NotificationProvider` и зарегистрируйте в `providers/index.server.ts`.

## Настройка каналов

### Тестовый режим (mock)

- В настройках включите **«Тестовый режим»** — все отправки идут через `MockNotificationProvider`.
- Для симуляции ошибки: `NOTIFICATIONS_MOCK_FAIL=1`.

### Telegram

1. Создайте бота через [@BotFather](https://t.me/BotFather).
2. На сервере: `NOTIFICATIONS_TELEGRAM_BOT_TOKEN=…`
3. Пациент должен **написать боту** — без этого отправка по номеру телефона невозможна.
4. Сохраните `telegramChatId` в карточке пациента.

### WhatsApp Business API

Официальный API Meta (Cloud API) или провайдер (Twilio, MessageBird и т.д.).

Env:

- `NOTIFICATIONS_WHATSAPP_ACCESS_TOKEN`
- `NOTIFICATIONS_WHATSAPP_PHONE_NUMBER_ID`
- `NOTIFICATIONS_WHATSAPP_API_URL` (опционально)

Без ключей канал помечается «не настроен на сервере»; в testMode используется mock.

### SMS

Абстракция HTTP POST на шлюз:

- `NOTIFICATIONS_SMS_API_URL`
- `NOTIFICATIONS_SMS_API_KEY`
- `NOTIFICATIONS_SMS_SENDER`

Адаптируйте тело запроса в `sms.server.ts` под вашего оператора.

### E-mail

HTTP relay или SMTP-сервис:

- `NOTIFICATIONS_SMTP_URL`
- `NOTIFICATIONS_EMAIL_FROM`
- `NOTIFICATIONS_SMTP_API_KEY` (опционально)

## Cron

```bash
# каждые 5 минут
curl -X POST https://your-clinic.emkaro.ru/api/notifications/process \
  -H "Authorization: Bearer $NOTIFICATIONS_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Env: `NOTIFICATIONS_CRON_SECRET` (как `EGISZ_CRON_SECRET`).

Ручная проверка из UI: **«Проверить записи сейчас»**.

## Шаблоны

Переменные: `{{patientName}}`, `{{appointmentDate}}`, `{{appointmentTime}}`, `{{doctorName}}`, `{{cabinetName}}`, `{{clinicName}}`, `{{clinicPhone}}`, `{{clinicAddress}}`, `{{confirmUrl}}`.

**По умолчанию в тексте нет диагнозов, услуг и мед. данных.**

## Персональные данные (152-ФЗ)

- Согласие пациента обязательно (`notificationPrefs.consentForNotifications`).
- Можно отключить уведомления для пациента.
- Журнал хранит preview (до 200 символов), без диагнозов.
- Секреты только в `.env` на сервере, не в frontend/localStorage.

## Подтверждение записи

Если задан `APP_PUBLIC_BASE_URL` или `publicBaseUrl` в настройках, в шаблон подставляется `{{confirmUrl}}` — подписанная ссылка на `GET /api/notifications/action?token=…` (статус → `confirmed`).

## Миграция БД

```bash
DATABASE_URL=... npm run db:init
# или --migrations-only на проде
```

Файл: `db/migrations/007-patient-notifications.sql`

## Проверка

```bash
NODE_OPTIONS='--import tsx' node --test lib/notifications/template-service.test.ts
npm run build
```

1. Включите модуль у супер-админа.
2. Откройте `/notifications`, включите уведомления и testMode.
3. Дайте пациенту согласие, создайте запись.
4. **Тестирование** → отправить mock.
5. Проверьте **Журнал**.
