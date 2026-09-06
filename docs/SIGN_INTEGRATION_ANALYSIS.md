# Анализ: интеграция Emkaro Sign в МИС

**Дата:** 2026-09-05  
**Репозиторий:** dentalcloud-mis (основная МИС Emkaro)

## Что найдено

### Архитектура
- Next.js App Router (`app/`), данные клиники в `clinic_snapshots` (JSONB).
- Мультитенантность: поддомен (`clinicSlug`) + `session.clinicId` (UUID в таблице `clinics`).
- **`organizationId` в сессии МИС нет** — UUID org/clinic Sign хранятся в `clinics.emkaro_sign_config` / `EMKARO_SIGN_TENANT_MAP`.
- Роли: `owner | admin | doctor | assistant | accountant | partner`.
- Cookie-сессия `dc_session` (`lib/auth-session-token.ts`).

### Пациент
- Стабильный ID: **`Patient.id`** (строка вида `pat_…`, не UUID БД).
- Телефон: **`Patient.phone`** (нормализация `+7…` в `lib/phone-utils.ts`).
- Карточка: `components/patients/patient-detail-view.tsx`.

### Документы
- Юр. отдел: `LegalDocument` в снимке клиники.
- Окно «Пациент пришёл — документы»: `components/appointments/appointment-documents-modal.tsx` (открывается при статусе `arrived`).
- PDF для Sign: `lib/document-sign/arrival-pdf.server.ts` (сервер, не browser).

### Кнопка отправки
- Модуль супер-админки: **`document_sign`** (по умолчанию выкл.).
- Провайдеры: `emkaro` | `emkaro_sign` | `fdoc` (`DOCUMENT_SIGN_PROVIDER`).
- Сейчас `emkaro_sign`: импорт пациента/PDF → Sign сам шлёт SMS (delivery-destination).
- API: `POST /api/document-sign/send`, webhook `POST /api/webhooks/emkaro-sign`.

### Уведомления / PWA
- SMS-шлюз МИС (`NOTIFICATIONS_SMS_*`) — для режима `emkaro` и напоминаний; **не** для целевой модели clinic-device.
- Service worker / Web Push есть для staff-уведомлений, не для SMS-задач клиники.

## Разрыв с целевой архитектурой

| Целевое | Сейчас |
|---------|--------|
| Sign возвращает `smsText` + `publicSignUrl` | Нет потребления этих полей |
| Привязка телефона клиники | Нет |
| `ClinicSmsSendTask` + ручное «Отправить» | Нет |
| `MANUAL_SEND_CONFIRMED` | Нет |
| МИС не SMS-провайдер | Частично (только `emkaro_sign`) |

## Mapping layer (ID)

| Концепт | В МИС | В Sign |
|---------|-------|--------|
| organizationId | `emkaro_sign_config.organizationId` | Organization.id |
| clinicId | `clinics.id` (MIS) / `emkaro_sign_config.clinicId` (Sign) | Clinic.id |
| patientId | `Patient.id` | `Patient.externalId` / emkaroPatientId |
| documentId | `LegalDocument.id` / arrival doc id | Document.externalRef |
| packageId | `document_sign_requests.external_id` | SignaturePackage.id |
| signOperationId | новое поле | publicId / operation id |

## План реализации в этом репо

1. Миграция: устройства, pairing, SMS tasks, расширенные поля статуса подписи.
2. SignIntegrationClient (server-only) + режим clinic-device delivery.
3. Pairing QR/код + страница `/sign/sender-device`.
4. Задачи на устройство (polling), `sms:` URI, подтверждение отправки.
5. Confirm-диалог перед созданием пакета; статусы в UI.
6. Webhook Sign → статусы в МИС (без boolean-only).
7. Документация и тесты изоляции/idempotency/HMAC.

Режимы `emkaro` (свой OTP+/sign) и `fdoc` не ломаем.
