/** Каталог поддерживаемых CDA-шаблонов Emkaro (стоматология / амбулатория) */

export type CdaTemplateFamily =
  | "consultation"
  | "referral"
  | "instrumental"
  | "tax_certificate"
  | "epicrisis";

export interface CdaTemplateMeta {
  /** Уникальный ключ шаблона в Emkaro */
  key: string;
  templateOid: string;
  remdCode: string;
  idMedDocumentType: string;
  /** Код ClinicalDocument/code в справочнике 2.195 (У1-13) */
  cdaHeaderCode?: string;
  /**
   * displayName для ClinicalDocument/code по справочнику 11.1522.
   * Не путать с человекочитаемым названием редакции шаблона.
   */
  nsiDisplayName?: string;
  displayName: string;
  family: CdaTemplateFamily;
  /** OID шаблона по умолчанию для новых клиник */
  defaultForDental?: boolean;
  materialsUrl?: string;
}

export const CDA_TEMPLATE_CATALOG: CdaTemplateMeta[] = [
  {
    key: "consultation_rev4",
    /** Официальный templateId из схематрона/эталона Минздрава (У1-11) */
    templateOid: "1.2.643.5.1.13.2.7.5.1.5.9.4",
    remdCode: "119",
    idMedDocumentType: "198",
    cdaHeaderCode: "5",
    nsiDisplayName: "Протокол консультации",
    displayName: "Протокол консультации (CDA) Редакция 4",
    family: "consultation",
    defaultForDental: true,
    materialsUrl: "https://portal.egisz.rosminzdrav.ru/materials/4023",
  },
  {
    key: "consultation_rev5",
    templateOid: "1.2.643.5.1.13.13.15.13.5",
    remdCode: "227",
    idMedDocumentType: "316",
    displayName: "Протокол консультации (CDA) Редакция 5",
    family: "consultation",
    materialsUrl: "https://portal.egisz.rosminzdrav.ru/materials/4557",
  },
  {
    key: "consultation_rev7",
    templateOid: "1.2.643.5.1.13.13.15.13.7",
    remdCode: "290",
    idMedDocumentType: "372",
    displayName: "Протокол консультации (CDA) Редакция 7",
    family: "consultation",
    materialsUrl: "https://portal.egisz.rosminzdrav.ru/materials/5055",
  },
  {
    key: "consultation_dispensary_rev4",
    templateOid: "1.2.643.5.1.13.13.14.85.9.4",
    remdCode: "111",
    idMedDocumentType: "200",
    cdaHeaderCode: "85",
    nsiDisplayName: "Протокол консультации в рамках диспансерного наблюдения",
    displayName: "Протокол консультации в рамках диспансерного наблюдения (CDA) Редакция 4",
    family: "consultation",
    materialsUrl: "https://portal.egisz.rosminzdrav.ru/materials/4023",
  },
  {
    key: "referral_auxiliary_rev2",
    templateOid: "1.2.643.5.1.13.13.14.57.9.2",
    remdCode: "185",
    idMedDocumentType: "271",
    displayName: "Направление на консультацию и во вспомогательные кабинеты (CDA) Редакция 2",
    family: "referral",
    materialsUrl: "https://portal.egisz.rosminzdrav.ru/materials/4357",
  },
  {
    key: "referral_lab_rev1",
    templateOid: "1.2.643.5.1.13.13.15.85.1",
    remdCode: "202",
    idMedDocumentType: "291",
    displayName: "Направление на лабораторное исследование (CDA) Редакция 1",
    family: "referral",
    materialsUrl: "https://portal.egisz.rosminzdrav.ru/materials/4461",
  },
  {
    key: "referral_hospital_rev4",
    templateOid: "1.2.643.5.1.13.13.15.31.4",
    remdCode: "206",
    idMedDocumentType: "295",
    displayName: "Направление на госпитализацию, обследование, консультацию (CDA) Редакция 4",
    family: "referral",
    materialsUrl: "https://portal.egisz.rosminzdrav.ru/materials/4495",
  },
  {
    key: "instrumental_rev5",
    templateOid: "1.2.643.5.1.13.13.15.17.5",
    remdCode: "224",
    idMedDocumentType: "309",
    displayName: "Протокол инструментального исследования (CDA) Редакция 5",
    family: "instrumental",
    materialsUrl: "https://portal.egisz.rosminzdrav.ru/materials/4491",
  },
  {
    key: "tax_certificate_rev2",
    templateOid: "1.2.643.5.1.13.13.14.52.9.2",
    remdCode: "193",
    idMedDocumentType: "279",
    displayName: "Справка об оплате медицинских услуг для предоставления в налоговые органы (CDA) Редакция 2",
    family: "tax_certificate",
    materialsUrl: "https://portal.egisz.rosminzdrav.ru/materials/4377",
  },
  {
    key: "tax_certificate_rev1",
    templateOid: "1.2.643.5.1.13.13.14.52.9.1",
    remdCode: "100",
    idMedDocumentType: "115",
    displayName: "Справка об оплате медицинских услуг для предоставления в налоговые органы (CDA) Редакция 1",
    family: "tax_certificate",
    materialsUrl: "https://portal.egisz.rosminzdrav.ru/materials/3991",
  },
  {
    key: "epicrisis_ambulatory_rev5",
    templateOid: "1.2.643.5.1.13.13.15.62.5",
    remdCode: "233",
    idMedDocumentType: "322",
    displayName: "Эпикриз по законченному случаю амбулаторный (CDA) Редакция 5",
    family: "epicrisis",
    materialsUrl: "https://portal.egisz.rosminzdrav.ru/materials/4581",
  },
  {
    key: "epicrisis_ambulatory_rev4",
    templateOid: "1.2.643.5.1.13.13.14.92.9.4",
    remdCode: "92",
    idMedDocumentType: "108",
    displayName: "Эпикриз по законченному случаю амбулаторный (CDA) Редакция 4",
    family: "epicrisis",
    materialsUrl: "https://portal.egisz.rosminzdrav.ru/materials/3927",
  },
];

export const DEFAULT_DENTAL_TEMPLATE_OID =
  CDA_TEMPLATE_CATALOG.find((t) => t.defaultForDental)?.templateOid ??
  "1.2.643.5.1.13.2.7.5.1.5.9.4";

/** Устаревший OID из ранних интеграций N3 — маппится на тот же шаблон */
export const LEGACY_CONSULTATION_REV4_TEMPLATE_OID =
  "1.2.643.5.1.13.13.14.1.9.1.181";

export const N3_TEMPLATE_OID_TO_MED_DOCUMENT_TYPE: Record<string, string> =
  Object.fromEntries([
    ...CDA_TEMPLATE_CATALOG.map((t) => [t.templateOid, t.idMedDocumentType] as const),
    [LEGACY_CONSULTATION_REV4_TEMPLATE_OID, "198"] as const,
  ]);

export function findCdaTemplateByOid(oid?: string): CdaTemplateMeta | undefined {
  const normalized = oid?.trim();
  if (!normalized) return CDA_TEMPLATE_CATALOG.find((t) => t.defaultForDental);
  const direct = CDA_TEMPLATE_CATALOG.find((t) => t.templateOid === normalized);
  if (direct) return direct;
  if (normalized === LEGACY_CONSULTATION_REV4_TEMPLATE_OID) {
    return CDA_TEMPLATE_CATALOG.find((t) => t.key === "consultation_rev4");
  }
  return undefined;
}

export function findCdaTemplateByMedDocumentType(id: string): CdaTemplateMeta | undefined {
  return CDA_TEMPLATE_CATALOG.find((t) => t.idMedDocumentType === id);
}

export function listSupportedCdaTemplates(): CdaTemplateMeta[] {
  return [...CDA_TEMPLATE_CATALOG];
}
