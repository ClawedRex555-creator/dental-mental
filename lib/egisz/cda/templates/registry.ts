import type { CdaBuildInput } from "@/lib/egisz/cda/shared/types";
import { buildCdaDocumentContext } from "@/lib/egisz/cda/shared/context";
import { wrapClinicalDocument } from "@/lib/egisz/cda/shared/envelope";
import {
  buildConsultationBody,
  buildEpicrisisBody,
  buildInstrumentalBody,
  buildReferralBody,
  buildTaxCertificateBody,
} from "@/lib/egisz/cda/shared/sections";
import {
  DEFAULT_RADIOLOGY_SERVICE_CODE,
  DEFAULT_RADIOLOGY_SERVICE_NAME,
} from "@/lib/egisz/cda/nsi-constants";
import {
  findCdaTemplateByOid,
  type CdaTemplateMeta,
} from "@/lib/egisz/cda/templates/catalog";

function buildByFamily(input: CdaBuildInput, meta: CdaTemplateMeta): string {
  const ctx = buildCdaDocumentContext(input);

  if (meta.family === "instrumental") {
    ctx.clinical.serviceCode =
      input.record.serviceCode?.trim() || DEFAULT_RADIOLOGY_SERVICE_CODE;
    ctx.clinical.serviceName =
      input.record.serviceName?.trim() || DEFAULT_RADIOLOGY_SERVICE_NAME;
    ctx.title = input.record.serviceName ?? "Протокол инструментального исследования";
    return wrapClinicalDocument(ctx, meta, buildInstrumentalBody(ctx));
  }

  if (meta.family === "referral") {
    ctx.title = input.record.serviceName ?? "Направление";
    const target =
      input.record.referralTarget?.trim() ||
      "Медицинская организация по месту направления";
    return wrapClinicalDocument(ctx, meta, buildReferralBody(ctx, target));
  }

  if (meta.family === "tax_certificate") {
    ctx.title = "Справка об оплате медицинских услуг";
    const total = input.record.paymentAmount ?? 0;
    return wrapClinicalDocument(ctx, meta, buildTaxCertificateBody(ctx, total));
  }

  if (meta.family === "epicrisis") {
    ctx.title = "Эпикриз по законченному случаю амбулаторный";
    return wrapClinicalDocument(ctx, meta, buildEpicrisisBody(ctx));
  }

  ctx.title = input.record.serviceName ?? meta.displayName;
  return wrapClinicalDocument(ctx, meta, buildConsultationBody(ctx));
}

export function buildCdaForTemplate(input: CdaBuildInput): string {
  const meta = findCdaTemplateByOid(input.config.documentOid);
  if (!meta) {
    throw new Error(
      `Неподдерживаемый OID шаблона CDA: ${input.config.documentOid ?? "(не задан)"}.`
    );
  }
  return buildByFamily(input, meta);
}

export function isSupportedCdaTemplateOid(oid?: string): boolean {
  return Boolean(findCdaTemplateByOid(oid));
}
