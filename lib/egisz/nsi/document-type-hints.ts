/** Коды NSI и маппинг OID шаблона CDA → IdMedDocumentType */

export const NSI_OID_MED_DOCUMENT_TYPES = "1.2.643.2.69.1.1.1.195";

/** Шаблон CDA стоматологического протокола консультации (N3 / ЕГИСЗ) */
export const CDA_CONSULTATION_TEMPLATE_OID = "1.2.643.5.1.13.13.14.1.9.1.181";

/**
 * Подтверждено справочником NSI 1.2.643.2.69.1.1.1.195 (выгрузка 374).
 * В AddMedRecord → IdMedDocumentType передаётся 198, не remd_code 119.
 */
export const CDA_CONSULTATION_REV4_NSI = {
  templateOid: CDA_CONSULTATION_TEMPLATE_OID,
  idMedDocumentType: "198",
  remd_code: "119",
  name: "Протокол консультации (CDA) Редакция 4",
  fhirCode: "11488-4",
  mime_type_remd: "CDA",
} as const;

export const N3_TEMPLATE_OID_TO_MED_DOCUMENT_TYPE: Record<string, string> = {
  [CDA_CONSULTATION_TEMPLATE_OID]: CDA_CONSULTATION_REV4_NSI.idMedDocumentType,
};

export function resolveN3MedDocumentType(documentOid?: string): string {
  const oid = documentOid?.trim() || CDA_CONSULTATION_TEMPLATE_OID;
  return N3_TEMPLATE_OID_TO_MED_DOCUMENT_TYPE[oid] ?? CDA_CONSULTATION_REV4_NSI.idMedDocumentType;
}
