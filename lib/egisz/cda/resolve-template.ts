import type { EgiszDocumentType } from "@/lib/egisz/types";
import type { MedicalRecord } from "@/lib/types";
import { DEFAULT_RADIOLOGY_SERVICE_CODE } from "@/lib/egisz/cda/nsi-constants";
import {
  CDA_TEMPLATE_CATALOG,
  DEFAULT_DENTAL_TEMPLATE_OID,
  findCdaTemplateByOid,
  type CdaTemplateMeta,
} from "@/lib/egisz/cda/templates/catalog";

function templateByKey(key: string): CdaTemplateMeta {
  const meta = CDA_TEMPLATE_CATALOG.find((t) => t.key === key);
  if (!meta) {
    throw new Error(`Внутренняя ошибка: неизвестный ключ шаблона CDA «${key}»`);
  }
  return meta;
}

function defaultConsultationTemplate(): CdaTemplateMeta {
  return findCdaTemplateByOid(DEFAULT_DENTAL_TEMPLATE_OID) ?? templateByKey("consultation_rev4");
}

function isRadiologyService(record?: MedicalRecord): boolean {
  const code = record?.serviceCode?.trim();
  if (!code) return false;
  return code === DEFAULT_RADIOLOGY_SERVICE_CODE || code.startsWith("A06.");
}

/**
 * Выбирает CDA-шаблон по типу отправки и данным медкарты.
 * Настройки клиники не требуют ручного выбора OID.
 */
export function resolveCdaTemplate(input: {
  documentType: EgiszDocumentType;
  record?: MedicalRecord;
}): CdaTemplateMeta {
  const { documentType, record } = input;

  if (record?.referralTarget?.trim()) {
    return templateByKey("referral_auxiliary_rev2");
  }

  if (isRadiologyService(record)) {
    return templateByKey("instrumental_rev5");
  }

  if (documentType === "semd_dental_examination" || documentType === "semd_consultation") {
    return defaultConsultationTemplate();
  }

  return defaultConsultationTemplate();
}

export function describeCdaTemplateResolution(meta: CdaTemplateMeta): string {
  return `${meta.displayName} (СЭМД ${meta.remdCode})`;
}
