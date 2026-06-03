/** OID и коды NSI для CDA (упрощённый набор для N3 тестирования) */

/** Стоматологический осмотр / протокол консультации */
export const CDA_TEMPLATE_OID = "1.2.643.5.1.13.13.14.1.9.1.181";

export const CDA_TYPE_ID_ROOT = "2.16.840.1.113883.1.3";
export const CDA_TYPE_ID_EXTENSION = "POCD_HD000040";

export const HL7_NS = "urn:hl7-org:v3";
export const XSI_NS = "http://www.w3.org/2001/XMLSchema-instance";

/** Пол: 1 — м, 2 — ж (ЕГИСЗ) */
export function mapGenderToEgisz(gender: string): "1" | "2" {
  const g = gender.toLowerCase();
  if (g === "female" || g === "f" || g === "ж" || g === "женский") return "2";
  return "1";
}

export function formatSnilsForCda(snils: string): string {
  const digits = snils.replace(/\D/g, "");
  if (digits.length !== 11) return snils.trim();
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)} ${digits.slice(9)}`;
}
