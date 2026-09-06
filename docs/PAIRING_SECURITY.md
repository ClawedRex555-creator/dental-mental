# Pairing security — телефон клиники

## Угрозы и меры

| Риск | Мера |
|------|------|
| Утечка pairing token | Одноразовый, TTL 5 мин, hash в БД, уничтожение после use |
| Brute-force short code | 6 цифр + короткий TTL; один активный код на клинику |
| Чужой clinic | Device token привязан к `clinicId`; tasks фильтруются по clinic |
| Replay webhook | `eventId` unique |
| Логи с secret URL | `redactSignUrl()` |

## Формулировки UI

- «Номер отправителя, заявленный клиникой» — не «SIM подтверждена».
- «Устройство привязано» — отдельно от номера.
