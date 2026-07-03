import catalog from "@/data/nsi/1.2.643.2.69.1.1.1.195.json";
import {
  CDA_CONSULTATION_REV4_NSI,
  resolveN3MedDocumentType,
} from "@/lib/egisz/nsi/document-type-hints";

export interface NsiMedDocumentType195 {
  code?: string;
  idMedDocumentType: string;
  name: string;
  nameRemd?: string;
  dataSourceRemd?: string;
  remd_code?: string;
  semd_code?: string;
  vimis_code?: string;
  mime_type_remd?: string;
  fhirCode?: string;
  iemkObject?: string;
  allowRemdExport?: string;
  allowVimisExport?: string;
  doctorPortal?: string;
}

export interface NsiMedDocumentCatalog195 {
  oid: string;
  title: string;
  source: string;
  updatedAt: string;
  version?: string;
  itemCount: number;
  items: NsiMedDocumentType195[];
}

const typedCatalog = catalog as NsiMedDocumentCatalog195;

const byId = new Map(
  typedCatalog.items.map((item) => [item.idMedDocumentType, item] as const)
);

export function getNsi195Catalog(): NsiMedDocumentCatalog195 {
  return typedCatalog;
}

export function getNsi195MedDocumentType(
  idMedDocumentType: string
): NsiMedDocumentType195 | undefined {
  return byId.get(idMedDocumentType.trim());
}

export function findNsi195ByNameQuery(query: string, limit = 20): NsiMedDocumentType195[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: NsiMedDocumentType195[] = [];
  for (const item of typedCatalog.items) {
    if (
      item.name.toLowerCase().includes(q) ||
      item.idMedDocumentType.includes(q) ||
      (item.remd_code?.includes(q) ?? false)
    ) {
      out.push(item);
      if (out.length >= limit) break;
    }
  }
  return out;
}

/** Проверка соответствия настройкам CDA перед отправкой в N3 */
export function validateN3MedDocumentTypeForTemplate(
  documentOid?: string
): { ok: true; idMedDocumentType: string; entry?: NsiMedDocumentType195 } | { ok: false; error: string } {
  const idMedDocumentType = resolveN3MedDocumentType(documentOid);
  const entry = getNsi195MedDocumentType(idMedDocumentType);
  if (!entry) {
    return {
      ok: false,
      error: `IdMedDocumentType ${idMedDocumentType} не найден в справочнике ${typedCatalog.oid}`,
    };
  }
  if (
    documentOid?.trim() === CDA_CONSULTATION_REV4_NSI.templateOid &&
    idMedDocumentType !== CDA_CONSULTATION_REV4_NSI.idMedDocumentType
  ) {
    return {
      ok: false,
      error: `Для OID ${CDA_CONSULTATION_REV4_NSI.templateOid} ожидается IdMedDocumentType ${CDA_CONSULTATION_REV4_NSI.idMedDocumentType}`,
    };
  }
  return { ok: true, idMedDocumentType, entry };
}
