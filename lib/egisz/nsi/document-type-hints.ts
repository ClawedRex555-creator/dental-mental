/** Коды NSI и маппинг OID шаблона CDA → IdMedDocumentType */

import {
  findCdaTemplateByOid,
  CDA_TEMPLATE_CATALOG,
  DEFAULT_DENTAL_TEMPLATE_OID,
  N3_TEMPLATE_OID_TO_MED_DOCUMENT_TYPE,
  listSupportedCdaTemplates,
} from "@/lib/egisz/cda/templates/catalog";

export const NSI_OID_MED_DOCUMENT_TYPES = "1.2.643.2.69.1.1.1.195";

export {
  CDA_TEMPLATE_CATALOG,
  DEFAULT_DENTAL_TEMPLATE_OID,
  N3_TEMPLATE_OID_TO_MED_DOCUMENT_TYPE,
  findCdaTemplateByOid,
  listSupportedCdaTemplates,
};

/** Шаблон CDA стоматологического протокола консультации (официальный OID SEMD 119 rev.4) */
export const CDA_CONSULTATION_TEMPLATE_OID = "1.2.643.5.1.13.2.7.5.1.5.9.4";

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

export function resolveN3MedDocumentType(documentOid?: string): string {
  const meta = findCdaTemplateByOid(documentOid);
  if (meta) return meta.idMedDocumentType;
  return CDA_CONSULTATION_REV4_NSI.idMedDocumentType;
}
