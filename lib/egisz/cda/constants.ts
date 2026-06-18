/** OID и коды NSI для CDA (упрощённый набор для N3 тестирования) */

/** Стоматологический осмотр / протокол консультации */
export const CDA_TEMPLATE_OID = "1.2.643.5.1.13.13.14.1.9.1.181";

/**
 * Код типа документа в справочнике 1.2.643.2.69.1.1.1.195 для AddMedRecord.
 * 119 — «Протокол консультации (CDA) Редакция 4» (актуальный для стоматологии / приёма).
 * Не путать с суффиксом OID шаблона (.181) — это не код из справочника 195.
 */
export const N3_MED_DOCUMENT_TYPE_BY_OID: Record<string, string> = {
  [CDA_TEMPLATE_OID]: "119",
};

export function resolveN3MedDocumentType(documentOid?: string): string {
  const oid = documentOid?.trim() || CDA_TEMPLATE_OID;
  return N3_MED_DOCUMENT_TYPE_BY_OID[oid] ?? "119";
}

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
