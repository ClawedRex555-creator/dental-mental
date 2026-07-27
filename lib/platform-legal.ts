/**
 * Реквизиты оператора персональных данных сайта Emkaro (лендинг).
 * Адрес регистрации ИП — из ЕГРИП; задайте NEXT_PUBLIC_EMKARO_OPERATOR_ADDRESS.
 */
export const PLATFORM_OPERATOR = {
  legalName: "ИП Макарова Ирина Ивановна",
  inn: "692403493042",
  ogrnip: "315618100003050",
  email: "privacyemkaro@internet.ru",
  phoneDisplay: "+7 (960) 248-21-60",
  phoneHref: "tel:+79602482160",
  emailHref: "mailto:privacyemkaro@internet.ru",
  /** Адрес регистрации по ЕГРИП; можно переопределить через env */
  registrationAddress:
    process.env.NEXT_PUBLIC_EMKARO_OPERATOR_ADDRESS?.trim() ||
    "346720, Ростовская обл., Аксайский р-н, г. Аксай, ул. Луначарского, 253/65",
  siteUrl: "https://emkaro.ru",
  privacyPath: "/privacy",
  consentPath: "/personal-data-consent",
  cookiesPath: "/cookies",
  contactsPath: "/contacts",
} as const;

export const YANDEX_METRIKA_ID =
  process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID?.trim() || "";

export function operatorRequisitesLines(): string[] {
  const o = PLATFORM_OPERATOR;
  return [
    o.legalName,
    `ИНН ${o.inn}, ОГРНИП ${o.ogrnip}`,
    o.registrationAddress,
    `Email: ${o.email} · Тел.: ${o.phoneDisplay}`,
  ];
}
