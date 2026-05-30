# Фаза B: PostgreSQL + multi-clinic

## Цель

Одна установка — много клиник. Данные на сервере, не в `localStorage`.

## Минимальная схема

```
clinics (id, slug, name, settings_json, created_at)
users (id, clinic_id, email, password_hash, role, staff_id, name)
patients (id, clinic_id, ...)
appointments (id, clinic_id, ...)
```

## Правило

Каждый запрос: `WHERE clinic_id = session.clinicId`.

## Поддомен

`ulybka.example.ru` → middleware резолвит slug → `clinic_id` в сессии.

## Порядок миграции модулей

1. patients + appointments
2. doctors + staff
3. medical_records + work_acts
4. finance, warehouse, legal

Zustand остаётся кэшем UI; `persist` убрать для PHI.

## Env

```
DATABASE_URL=postgresql://mis:password@postgres:5432/dentalcloud
```

Раскомментируйте `postgres` в `docker-compose.yml`.
