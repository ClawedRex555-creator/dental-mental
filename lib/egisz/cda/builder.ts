import "server-only";

export type { CdaBuildInput } from "@/lib/egisz/cda/shared/types";
export { buildCdaForTemplate as buildCdaDocument } from "@/lib/egisz/cda/templates/registry";
export {
  listSupportedCdaTemplates,
  findCdaTemplateByOid,
  DEFAULT_DENTAL_TEMPLATE_OID,
} from "@/lib/egisz/cda/templates/catalog";
export { resolveCdaTemplate, describeCdaTemplateResolution } from "@/lib/egisz/cda/resolve-template";

/** @deprecated используйте buildCdaDocument */
export { buildCdaForTemplate as buildConsultationRev4Cda } from "@/lib/egisz/cda/templates/registry";
