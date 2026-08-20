import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFDropdown, PDFTextField } from "pdf-lib";
import {
  buildArrivalDocumentTokens,
  type ArrivalDocumentContext,
} from "@/lib/arrival-documents";
import { resolveTokenForPdfField } from "@/lib/legal-pdf-field-map";
import { LEGAL_PDF_FIELD_HINTS } from "@/lib/legal-pdf-fields";
import { parseAllowedDataUrl } from "@/lib/safe-data-url";

const NOTO_SANS_URLS = [
  "/fonts/NotoSans-Regular.ttf",
  "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSans/NotoSans-Regular.ttf",
];

let cyrillicFontPromise: Promise<ArrayBuffer> | null = null;

async function loadCyrillicFontBytes(): Promise<ArrayBuffer> {
  let lastError: Error | null = null;
  for (const url of NOTO_SANS_URLS) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.arrayBuffer();
    } catch (e) {
      lastError = e instanceof Error ? e : new Error("Не удалось загрузить шрифт для PDF");
    }
  }
  throw lastError ?? new Error("Не удалось загрузить шрифт для PDF");
}

function loadCyrillicFontBytesCached(): Promise<ArrayBuffer> {
  if (!cyrillicFontPromise) {
    cyrillicFontPromise = loadCyrillicFontBytes();
  }
  return cyrillicFontPromise;
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function isUsefulValue(value: string | null): value is string {
  return Boolean(value && value.trim() && value.trim() !== "—");
}

export type FillLegalPdfResult =
  | {
      ok: true;
      bytes: Uint8Array;
      filledCount: number;
      fieldCount: number;
      unmatchedFields: string[];
      /** PDF без AcroForm — печатаем оригинал без автозаполнения */
      passthrough?: boolean;
    }
  | { ok: false; error: string; fieldCount?: number; fieldNames?: string[] };

export type InspectLegalPdfResult =
  | {
      ok: true;
      fieldCount: number;
      fieldNames: string[];
      pageCount: number;
      acroFormMarker: boolean;
    }
  | { ok: false; error: string };

function pdfBytesContainAcroFormMarker(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, Math.min(bytes.length, 800_000));
  const text = new TextDecoder("latin1").decode(sample);
  return text.includes("/AcroForm") || text.includes("/Widget") || text.includes("/Tx");
}

/** Проверка PDF при загрузке: есть ли поля формы и как они называются */
export async function inspectLegalPdf(dataUrl: string): Promise<InspectLegalPdfResult> {
  const parsed = parseAllowedDataUrl(dataUrl);
  if (!parsed || parsed.kind !== "pdf") {
    return { ok: false, error: "Файл не является PDF" };
  }

  try {
    const bytes = dataUrlToBytes(parsed.dataUrl);
    const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const form = pdfDoc.getForm();
    const fields = form.getFields();
    const fieldNames = fields.map((f) => f.getName());

    return {
      ok: true,
      fieldCount: fields.length,
      fieldNames,
      pageCount: pdfDoc.getPageCount(),
      acroFormMarker: pdfBytesContainAcroFormMarker(bytes),
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Ошибка чтения PDF";
    return { ok: false, error: message };
  }
}

/** Заполняет PDF с полями формы (AcroForm) данными пациента и клиники */
export async function fillLegalPdf(
  dataUrl: string,
  ctx: ArrivalDocumentContext
): Promise<FillLegalPdfResult> {
  const parsed = parseAllowedDataUrl(dataUrl);
  if (!parsed || parsed.kind !== "pdf") {
    return { ok: false, error: "Файл не является PDF" };
  }

  try {
    const sourceBytes = dataUrlToBytes(parsed.dataUrl);
    const pdfDoc = await PDFDocument.load(sourceBytes, { ignoreEncryption: true });
    pdfDoc.registerFontkit(fontkit);

    const form = pdfDoc.getForm();
    const fields = form.getFields();
    const fieldNames = fields.map((f) => f.getName());

    if (fields.length === 0) {
      // Скан / PDF без полей формы: всё равно отдаём оригинал на печать
      return {
        ok: true,
        bytes: sourceBytes,
        filledCount: 0,
        fieldCount: 0,
        unmatchedFields: [],
        passthrough: true,
      };
    }

    const tokens = buildArrivalDocumentTokens(ctx);
    const fontBytes = await loadCyrillicFontBytesCached();
    const font = await pdfDoc.embedFont(fontBytes);

    let filledCount = 0;
    const unmatchedFields: string[] = [];

    for (const field of fields) {
      const name = field.getName();
      const value = resolveTokenForPdfField(name, tokens);

      if (!isUsefulValue(value)) {
        unmatchedFields.push(name);
        continue;
      }

      try {
        if (field instanceof PDFTextField) {
          field.setText(value);
          field.updateAppearances(font);
          filledCount++;
          continue;
        }
        if (field instanceof PDFDropdown) {
          const options = field.getOptions();
          const match = options.find(
            (opt) => opt.toLowerCase() === value.toLowerCase() || opt.includes(value)
          );
          if (match) {
            field.select(match);
            filledCount++;
          } else {
            unmatchedFields.push(name);
          }
          continue;
        }
        unmatchedFields.push(name);
      } catch {
        unmatchedFields.push(name);
      }
    }

    if (filledCount === 0) {
      return {
        ok: false,
        error:
          "Поля в PDF найдены, но имена не совпали с данными. Переименуйте поля в Word/Acrobat: patient.fullName, patient.phone, clinic.name и т.д.",
        fieldCount: fields.length,
        fieldNames,
      };
    }

    form.updateFieldAppearances(font);
    const bytes = await pdfDoc.save();

    return {
      ok: true,
      bytes,
      filledCount,
      fieldCount: fields.length,
      unmatchedFields,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Ошибка обработки PDF";
    return { ok: false, error: message };
  }
}

/** Склеивает несколько PDF в один файл для одной печати */
export async function mergePdfByteArrays(parts: Uint8Array[]): Promise<Uint8Array> {
  if (parts.length === 0) {
    throw new Error("Нет PDF для объединения");
  }
  if (parts.length === 1) return parts[0];

  const out = await PDFDocument.create();
  for (const bytes of parts) {
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const page of pages) out.addPage(page);
  }
  return out.save();
}

export { LEGAL_PDF_FIELD_HINTS } from "@/lib/legal-pdf-fields";
