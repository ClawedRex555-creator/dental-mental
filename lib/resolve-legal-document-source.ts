import type { ArrivalPrintDocument } from "@/lib/legal-categories";
import { parseAllowedDataUrl } from "@/lib/safe-data-url";

export interface LegalFileSource {
  fileDataUrl?: string;
  templateUrl?: string;
  fileName?: string;
}

export function legalDocumentHasFile(source: LegalFileSource): boolean {
  return Boolean(source.fileDataUrl || source.templateUrl);
}

export function isDocxLegalSource(source: LegalFileSource): boolean {
  if (source.fileDataUrl?.startsWith(
    "data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,"
  )) {
    return true;
  }
  const name = (source.fileName ?? source.templateUrl ?? "").toLowerCase();
  return name.endsWith(".docx");
}

export function isPdfLegalSource(source: LegalFileSource): boolean {
  if (source.fileDataUrl?.startsWith("data:application/pdf;base64,")) return true;
  const name = (source.fileName ?? source.templateUrl ?? "").toLowerCase();
  return name.endsWith(".pdf");
}

/** Загружает data URL из встроенного файла или статического шаблона public/ */
export async function resolveLegalDocumentDataUrl(
  source: LegalFileSource
): Promise<string | null> {
  if (source.fileDataUrl && parseAllowedDataUrl(source.fileDataUrl)) {
    return source.fileDataUrl;
  }
  if (!source.templateUrl) return null;

  const res = await fetch(source.templateUrl);
  if (!res.ok) return null;

  const blob = await res.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(blob);
  });

  return parseAllowedDataUrl(dataUrl)?.dataUrl ?? null;
}

export async function resolveArrivalDocumentDataUrl(
  doc: ArrivalPrintDocument
): Promise<string | null> {
  return resolveLegalDocumentDataUrl(doc);
}
