import "server-only";

import type { DocumentSignRef } from "@/lib/document-sign/types";
import type { FdocDocumentPayload } from "@/lib/document-sign/fdoc/types";

/**
 * Подготовка документов для отправки в F.Doc.
 * TODO после API: собрать PDF из юр. шаблонов (arrival-documents + legal-pdf-fill).
 */
export function buildFdocDocumentsFromRefs(refs: DocumentSignRef[]): FdocDocumentPayload[] {
  return refs.map((d) => ({
    title: d.name,
    fileName: `${d.name.replace(/[^\wа-яА-ЯёЁ\s.-]/gi, "").trim() || "document"}.pdf`,
    // contentBase64: … — добавим при интеграции PDF
  }));
}
