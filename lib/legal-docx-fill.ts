import Docxtemplater from "docxtemplater";
import mammoth from "mammoth";
import PizZip from "pizzip";
import {
  buildArrivalDocumentTokens,
  type ArrivalDocumentContext,
} from "@/lib/arrival-documents";
import { LEGAL_PDF_FIELD_CATALOG } from "@/lib/legal-pdf-fields";
import { parseAllowedDataUrl } from "@/lib/safe-data-url";
import { escapeHtml } from "@/lib/escape-html";

const DOCX_MIME =
  "data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,";

import {
  collectPlaceholdersFromDocxXml,
  DOCX_TEMPLATE_PARTS_RE,
  normalizeDocxPlaceholderXml,
} from "@/lib/legal-docx-xml";

function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function isDocxDataUrl(dataUrl: string | undefined): boolean {
  return Boolean(dataUrl?.startsWith(DOCX_MIME));
}

export function buildDocxTemplateData(ctx: ArrivalDocumentContext): Record<string, string> {
  const tokens = buildArrivalDocumentTokens(ctx);
  const data: Record<string, string> = {};

  for (const field of LEGAL_PDF_FIELD_CATALOG) {
    const value = tokens[field.tokenKey];
    data[field.wordName] = value && value !== "—" ? value : "";
  }

  // Частые опечатки в Word-шаблонах
  if (data.doctor_specialty) {
    data.doctor_speciality = data.doctor_specialty;
  }

  return data;
}

function listDocxTemplatePartPaths(zip: PizZip): string[] {
  return Object.keys(zip.files).filter((name) => DOCX_TEMPLATE_PARTS_RE.test(name));
}

function prepareDocxZipForTemplating(zip: PizZip): void {
  for (const path of listDocxTemplatePartPaths(zip)) {
    const file = zip.file(path);
    if (!file) continue;
    const xml = file.asText();
    if (!xml) continue;
    zip.file(path, normalizeDocxPlaceholderXml(xml));
  }
}

function collectPlaceholdersFromDocxZip(zip: PizZip): string[] {
  const found = new Set<string>();
  for (const path of listDocxTemplatePartPaths(zip)) {
    const xml = zip.file(path)?.asText();
    if (!xml) continue;
    for (const name of collectPlaceholdersFromDocxXml(xml)) {
      found.add(name);
    }
  }
  return [...found];
}

export type InspectLegalDocxResult =
  | { ok: true; placeholderCount: number; placeholders: string[] }
  | { ok: false; error: string };

export async function inspectLegalDocx(dataUrl: string): Promise<InspectLegalDocxResult> {
  if (!isDocxDataUrl(dataUrl)) {
    return { ok: false, error: "Файл не является DOCX" };
  }

  try {
    const zip = new PizZip(dataUrlToArrayBuffer(dataUrl));
    const placeholders = collectPlaceholdersFromDocxZip(zip);
    return {
      ok: true,
      placeholderCount: placeholders.length,
      placeholders,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Ошибка чтения DOCX";
    return { ok: false, error: message };
  }
}

export type FillLegalDocxResult =
  | { ok: true; html: string; filledCount: number; placeholderCount: number }
  | { ok: false; error: string; placeholders?: string[] };

function wrapDocxPrintHtml(bodyHtml: string, title: string): string {
  const safeTitle = escapeHtml(title);
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8"/>
  <title>${safeTitle}</title>
  <style>
    body { font-family: "Times New Roman", Times, serif; font-size: 14px; line-height: 1.4; color: #111; margin: 16mm 14mm; }
    p { margin: 0 0 10px; }
    table { border-collapse: collapse; width: 100%; }
    td, th { border: 1px solid #ccc; padding: 4px 6px; vertical-align: top; }
    @media print { body { margin: 12mm 10mm; } }
  </style>
</head>
<body>
${bodyHtml}
<script>window.onload = () => window.print();</script>
</body>
</html>`;
}

/** Заполняет DOCX плейсхолдерами {patient_full_name} и конвертирует в HTML для печати */
export async function fillLegalDocxToPrintHtml(
  dataUrl: string,
  ctx: ArrivalDocumentContext,
  title = "Документ"
): Promise<FillLegalDocxResult> {
  if (!isDocxDataUrl(dataUrl)) {
    return { ok: false, error: "Файл не является DOCX" };
  }

  try {
    const inspection = await inspectLegalDocx(dataUrl);
    if (!inspection.ok) return { ok: false, error: inspection.error };
    if (inspection.placeholderCount === 0) {
      return {
        ok: false,
        error:
          "В DOCX нет плейсхолдеров {patient_full_name} и т.д. В Word вставьте обычный текст " +
          "в фигурных скобках — без вкладки «Разработчик».",
      };
    }

    const templateData = buildDocxTemplateData(ctx);
    let filledCount = 0;
    for (const key of inspection.placeholders) {
      if (templateData[key]?.trim()) filledCount++;
    }

    const zip = new PizZip(dataUrlToArrayBuffer(dataUrl));
    prepareDocxZipForTemplating(zip);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: "{", end: "}" },
    });
    doc.render(templateData);

    const filledBytes = doc.getZip().generate({
      type: "uint8array",
      compression: "DEFLATE",
    }) as Uint8Array;

    const filledBuffer = filledBytes.buffer.slice(
      filledBytes.byteOffset,
      filledBytes.byteOffset + filledBytes.byteLength
    ) as ArrayBuffer;

    const mammothResult = await mammoth.convertToHtml({
      arrayBuffer: filledBuffer,
    });

    return {
      ok: true,
      html: wrapDocxPrintHtml(mammothResult.value, title),
      filledCount,
      placeholderCount: inspection.placeholderCount,
    };
  } catch (e) {
    const message =
      e instanceof Error
        ? e.message.includes("Multi error")
          ? "Ошибка в плейсхолдерах DOCX — проверьте, что имена в {фигурных_скобках} без пробелов"
          : e.message
        : "Ошибка обработки DOCX";
    return { ok: false, error: message };
  }
}
