/** OID и коды NSI для CDA (N3 / ЕГИСЗ) */

export {
  CDA_CONSULTATION_TEMPLATE_OID as CDA_TEMPLATE_OID,
  CDA_CONSULTATION_REV4_NSI,
  NSI_OID_MED_DOCUMENT_TYPES,
  N3_TEMPLATE_OID_TO_MED_DOCUMENT_TYPE,
  resolveN3MedDocumentType,
} from "@/lib/egisz/nsi/document-type-hints";

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

/** 11 цифр без разделителей — как в AddPatient (DocN) и в CDA extension для N3 */
export function normalizeSnilsDigits(snils: string): string {
  return snils.replace(/\D/g, "");
}

export function formatSnilsForCda(snils: string): string {
  const digits = normalizeSnilsDigits(snils);
  if (digits.length !== 11) return snils.trim();
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)} ${digits.slice(9)}`;
}
