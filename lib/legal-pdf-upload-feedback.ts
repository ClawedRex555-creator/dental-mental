import { inspectLegalDocx, isDocxDataUrl } from "@/lib/legal-docx-fill";
import { inspectLegalPdf } from "@/lib/legal-pdf-fill";

export type LegalDocumentUploadFeedback =
  | { status: "other" }
  | { status: "error"; message: string }
  | { status: "no_fields"; message: string; hint?: string }
  | { status: "ok"; count: number; names: string[]; preview: string };

export async function getLegalDocumentUploadFeedback(
  dataUrl: string
): Promise<LegalDocumentUploadFeedback> {
  if (isDocxDataUrl(dataUrl)) {
    const inspection = await inspectLegalDocx(dataUrl);
    if (!inspection.ok) {
      return { status: "error", message: inspection.error };
    }
    if (inspection.placeholderCount === 0) {
      return {
        status: "no_fields",
        message:
          "В DOCX нет плейсхолдеров {patient_full_name}. В Word вставьте обычный текст в фигурных скобках.",
      };
    }
    const namesPreview =
      inspection.placeholders.length <= 6
        ? inspection.placeholders.join(", ")
        : `${inspection.placeholders.slice(0, 6).join(", ")}… (+${inspection.placeholders.length - 6})`;
    return {
      status: "ok",
      count: inspection.placeholderCount,
      names: inspection.placeholders,
      preview: `Найдено ${inspection.placeholderCount} плейсхолдеров: ${namesPreview}`,
    };
  }

  if (!dataUrl.startsWith("data:application/pdf;base64,")) {
    return { status: "other" };
  }

  const inspection = await inspectLegalPdf(dataUrl);
  if (!inspection.ok) {
    return { status: "error", message: inspection.error };
  }

  if (inspection.fieldCount === 0) {
    const message = inspection.acroFormMarker
      ? "PDF с формой, но поля не читаются (часто Word на Mac)"
      : "В PDF нет полей формы";
    return {
      status: "no_fields",
      message: `${message}. При печати откроется как есть (без автозаполнения).`,
      hint:
        "Чтобы подставлять ФИО и данные: сохраните как .docx с {patient_full_name} в тексте — или добавьте поля формы в PDF.",
    };
  }

  const namesPreview =
    inspection.fieldNames.length <= 6
      ? inspection.fieldNames.join(", ")
      : `${inspection.fieldNames.slice(0, 6).join(", ")}… (+${inspection.fieldNames.length - 6})`;

  return {
    status: "ok",
    count: inspection.fieldCount,
    names: inspection.fieldNames,
    preview: `Найдено ${inspection.fieldCount} полей: ${namesPreview}`,
  };
}

/** @deprecated */
export const getLegalPdfUploadFeedback = getLegalDocumentUploadFeedback;
