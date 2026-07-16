# Материалы ЕГИСЗ / СЭМД для Emkaro

Официальные инструкции, схематроны и примеры CDA лежат на портале Минздрава и в git репозитории SEMD. Emkaro по умолчанию отправляет **СЭМД 119 rev.4** (протокол консультации, стоматология = тот же тип + код услуги A16.07.*).

## Что проверять в первую очередь (наша интеграция)

| Поле / правило | Где в Emkaro | Комментарий |
|----------------|--------------|-------------|
| Название МО | Настройки → Профиль клиники → **Название** | Должно **буква в букву** совпадать с ФРМО и подписью |
| ОГРН / ОГРНИП | Настройки → **ОГРН** / **ОГРНИП** | ИНН **не** подставляется в `identity:Ogrn` |
| OID организации | Настройки → N3 / ЕГИСЗ | Как в ФРМО / ЛК N3 |
| IdMedDocumentType | автоматически | **198** для SEMD 119 (не 119) |
| Валидация XML | N3 ЛК → «Валидация по схематрону» | https://lk.n3health.ru |

## Критичные правила из ZIP SEMD 119 (проверено 16.07.2026)

Локальная копия: `data/egisz/schematron/consultation-rev4/`
- `schematron/119 Схематрон v.1.9.sch`
- `xml/Obs_Protocol_min.xml` / `Obs_Protocol_max.xml`

| Правило | Эталон | Emkaro |
|---------|--------|--------|
| `templateId` | `1.2.643.5.1.13.2.7.5.1.5.9.4` | то же (старый OID сохранён как alias) |
| Namespaces | `urn:hl7-ru:identity` и т.д. | то же |
| ФИО У1-1 | 1×`given` + `identity:Patronymic` | то же |
| `ClinicalDocument/code` | codeSystem `…11.1522` | то же |
| Паспорт пациента | IdentityDoc | без даты выдачи → `nullFlavor=NI` (неполная карточка падает на У1-21) |
| `encompassingEncounter/id[1]` | `….15` | случай оказания помощи |
| `encompassingEncounter/id[2]` | `….17` | амбулаторный случай |
| `medService:DocType` | `nullFlavor=NI` | или CD из 11.1522 |
| DOCINFO | поля 809, 800, 801 | МКБ / обращение / место |
| RESCONS | 804, 805, 806 + DGN(806 ST) | как Obs_Protocol_min |
| BENEFITS | не отправляем | опциональная секция |

### Production в Emkaro:

- `remd_code`: 119
- `templateOid`: `1.2.643.5.1.13.2.7.5.1.5.9.4`
- `ClinicalDocument/code`: 5 (справочник 11.1522)
- N3 `IdMedDocumentType`: 198

### Скачать официальный комплект (ZIP)

Страница материала (без логина):

https://portal.egisz.rosminzdrav.ru/materials/4023

Прямая ссылка на ZIP (может требовать браузер из‑за WAF):

https://portal.egisz.rosminzdrav.ru/media/6134/download/1.2.643.5.1.13.13.15.14-1.2.643.5.1.13.13.15.14.4.zip?v=4

В ZIP обычно: PDF руководство, XSD, **`.sch` схематрон**, примеры XML.

Git (ветка rev.4):

https://git.minzdrav.gov.ru/semd/1.2.643.5.1.13.13.15.13/-/tree/1.2.643.5.1.13.13.15.13.4

### Локально в репозитории

```bash
bash scripts/fetch-egisz-schematron.sh consultation-rev4
```

Сохраняет в `data/egisz/schematron/consultation-rev4/` (если портал отдаёт файл).

## Смежные типы (миграция / расширение)

| SEMD | rev | Portal ID | N3 IdMedDocumentType | Emkaro template key |
|------|-----|-----------|----------------------|---------------------|
| 119 | 4 | [4023](https://portal.egisz.rosminzdrav.ru/materials/4023) | 198 | `consultation_rev4` (default) |
| 227 | 5 | [4557](https://portal.egisz.rosminzdrav.ru/materials/4557) | 316 | `consultation_rev5` |
| 290 | 7 | [5055](https://portal.egisz.rosminzdrav.ru/materials/5055) | 372 | `consultation_rev7` |
| 185 | 2 | — | 271 | `referral_auxiliary_rev2` |
| 224 | 5 | — | 309 | `instrumental_rev5` |

Полный каталог шаблонов в коде: `lib/egisz/cda/templates/catalog.ts`.

## Портал materials — как пользоваться

1. Открыть https://portal.egisz.rosminzdrav.ru/materials в браузере (логин не обязателен для просмотра).
2. Найти нужный СЭМД по названию или OID.
3. Скачать ZIP с каждой карточки (массовой выгрузки нет — ~300+ типов, каждый отдельно).
4. Из ZIP взять `.sch` и примеры XML для сверки с нашим `lib/egisz/cda/`.

## N3: схематрон в личном кабинете

1. https://lk.n3health.ru → вход.
2. Раздел **«Валидация по схематрону»** (см. https://n3health.ru/validator).
3. Выбрать тип **119 / Протокол консультации**.
4. Вставить CDA из журнала отправки Emkaro → посмотреть построчные ошибки.

Публичный URL `/n3h-auth-client/app/emd-types` без сессии не открывается (Keycloak).

## Типичные ошибки ИП (исправлено в коде)

- ~~ИНН в `<identity:Ogrn>`~~ → теперь `<identity:Ogrnip>` из настроек или `nullFlavor`
- ~~`address:Type` у адреса МО~~ → только у пациента
- ~~`scopingOrganization/name` = Emkaro~~ → название клиники из ФРМО
- ~~`legalAuthenticator` без организации~~ → добавлен `representedOrganization`

## Дальнейшие шаги

1. Заполнить **ОГРНИП** и проверить **название** в настройках клиники (как в ФРМО).
2. Переотправить СЭМД и прогнать через схематрон N3.
3. При необходимости скачать ZIP SEMD 119 и добавить `.sch` в CI (`data/egisz/schematron/`).
4. Планировать переход на SEMD **227 rev.5** (актуальнее 119).

См. также: `docs/EGISZ-INTEGRATION.md`, `docs/N3-NSI-DICTIONARIES.md`.
