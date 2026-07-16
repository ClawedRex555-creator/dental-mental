# MedFlex / ПроДокторов

Интеграция онлайн-записи: выгрузка расписания/услуг на `mis-api.medflex.ru` и приём прямой записи на наши URL.

## Настройка клиники

1. Применить миграцию: `bash scripts/apply-migrations.sh 011-medflex-config.sql`
2. Модуль **Онлайн-запись** должен быть включён.
3. **Настройки** → блок MedFlex:
   - включить интеграцию;
   - вставить API-токен от менеджера MedFlex;
   - указать `filial_id` (любой стабильный) и название филиала;
   - сохранить → появится **входящий токен** и URL webhook’ов.
4. Отправить менеджеру URL + `Authorization: Token <наш входящий токен>`.
5. На сервере cron каждые 15 минут:

```bash
curl -X POST https://emkaro.ru/api/medflex/process \
  -H "Authorization: Bearer $MEDFLEX_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}'
```

`MEDFLEX_CRON_SECRET` (или fallback `EGISZ_CRON_SECRET`) в env.

## Наши endpoint’ы (на поддомене клиники)

| Назначение | Method | Path |
|------------|--------|------|
| Запись | POST | `/api/medflex/booking` |
| Отмена | POST | `/api/medflex/booking/cancel` |
| Статус | POST | `/api/medflex/booking/status` |
| Обновление | POST | `/api/medflex/booking/update` |
| Health | GET | `/api/medflex/health` → HTTP 204 |

## Исходящие вызовы к MedFlex

| Метод | Path |
|-------|------|
| Расписание врачей (30 дней) | `POST /v2/doctors/send_schedule/` |
| Услуги | `POST /v2/services/send_schedule/` |

`occupied_doctor_schedule_slot` не используем — полная выгрузка каждые 15 минут.

## Важно

- Токен MedFlex хранится только в `clinics.medflex_config`, не в git.
- Успешная запись создаёт пациента (если нет по телефону) и `Appointment` с `externalClaimId`.
