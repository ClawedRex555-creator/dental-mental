/** Коды типов документов Emkaro Sign (сид prisma/seed.ts). SMS-ПЭП только для части из них. */
export const EMKARO_SIGN_SMS_ALLOWED_TYPE_CODES = new Set([
  "PAID_MEDICAL_SERVICES_CONTRACT",
  "ESTIMATE",
  "ADDITIONAL_AGREEMENT",
]);

export const EMKARO_SIGN_KNOWN_TYPE_CODES = new Set([
  "PAID_MEDICAL_SERVICES_CONTRACT",
  "ESTIMATE",
  "ADDITIONAL_AGREEMENT",
  "INFORMED_MEDICAL_CONSENT",
]);

export type SignDocumentTypeResolution =
  | { ok: true; code: string; smsAllowed: boolean }
  | { ok: false; reason: string };

function isInformedMedicalConsent(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (n.startsWith("идс") || n.startsWith("идс ")) return true;
  if (/\bидс\b/.test(n)) return true;
  const informed = n.includes("информированн");
  const voluntary = n.includes("добровольн");
  const intervention =
    n.includes("медицинск") ||
    n.includes("вмешательств") ||
    n.includes("лечен");
  return informed && (voluntary || intervention);
}

function resolveContractTypeCode(name: string): string {
  const n = name.trim().toLowerCase();
  if (n.includes("смет")) return "ESTIMATE";
  if (n.includes("дополнительн")) return "ADDITIONAL_AGREEMENT";
  return "PAID_MEDICAL_SERVICES_CONTRACT";
}

/**
 * Маппинг документов МИС → коды Sign.
 * ИДС → INFORMED_MEDICAL_CONSENT (SMS-ПЭП запрещён; Sign/локальный фильтр отклонят).
 * Согласия без ИДС / карточка / отказ ЕГИСЗ — не подменяем чужими кодами.
 */
export function resolveSignDocumentType(input: {
  kind?: string;
  name: string;
}): SignDocumentTypeResolution {
  const kind = input.kind ?? "";
  const name = input.name.trim() || "Документ";

  if (kind === "contract") {
    const code = resolveContractTypeCode(name);
    return { ok: true, code, smsAllowed: true };
  }

  if (kind === "consent") {
    if (isInformedMedicalConsent(name)) {
      return {
        ok: true,
        code: "INFORMED_MEDICAL_CONSENT",
        smsAllowed: false,
      };
    }
    return {
      ok: false,
      reason: `«${name}»: этот тип ещё нельзя подписать через SMS`,
    };
  }

  if (kind === "health_card") {
    return {
      ok: false,
      reason: `«${name}»: карточка здоровья не отправляется на подпись по SMS`,
    };
  }

  if (kind === "egisz_refusal") {
    return {
      ok: false,
      reason: `«${name}»: отказ ЕГИСЗ не отправляется на подпись по SMS`,
    };
  }

  return {
    ok: false,
    reason: `«${name}»: неизвестный тип документа для Emkaro Sign`,
  };
}

/** Маска телефона для Sign / document_sign_requests (без полного номера). */
export function maskPhoneForSign(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  let national = digits;
  if (national.length === 11 && (national.startsWith("7") || national.startsWith("8"))) {
    national = national.slice(1);
  }
  if (national.length !== 10) return "+7 *** ***-**-****";
  const last4 = national.slice(-4);
  return `+7 *** ***-${last4.slice(0, 2)}-${last4.slice(2, 4)}`;
}
