# Deep link пациента Emkaro Sign

Ссылка вида:

`https://sign.emkaro.ru/s/{token}`

должна быть совместима с Universal Links / Android App Links приложения пациента.

- Если приложение установлено — ОС может открыть его.
- Если нет — web Sign.

**В этом репозитории МИС** ссылку **не генерирует** и token **не меняет**.  
Источник — только ответ Emkaro Sign (`publicSignUrl`).
