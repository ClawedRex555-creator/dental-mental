import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFDropdown, PDFTextField } from "pdf-lib";
import {
  buildArrivalDocumentTokens,
  type ArrivalDocumentContext,
} from "@/lib/arrival-documents";
import { resolveTokenForPdfField } from "@/lib/legal-pdf-field-map";
import { parseAllowedDataUrl } from "@/lib/safe-data-url";

const NOTO_SANS_URL =
  "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSans/NotoSans-Regular.ttf";

let cyrillicFontPromise: Promise<ArrayBuffer> | null = null;

function loadCyrillicFontBytes(): Promise<ArrayBuffer> {
  if (!cyrillicFontPromise) {
    cyrillicFontPromise = fetch(NOTO_SANS_URL).then((res) => {
      if (!res.ok) throw new Error("Не удалось загрузить шрифт для PDF");
      return res.arrayBuffer();
    });
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
    }
  | { ok: false; error: string; fieldCount?: number; fieldNames?: string[] };

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
    const pdfDoc = await PDFDocument.load(dataUrlToBytes(dataUrl));
    pdfDoc.registerFontkit(fontkit);

    const form = pdfDoc.getForm();
    const fields = form.getFields();
    const fieldNames = fields.map((f) => f.getName());

    if (fields.length === 0) {
      return {
        ok: false,
        error:
          "В PDF нет заполняемых полей формы. Обычный скан или бланк с подчёркиваниями заполнить нельзя — нужен PDF с полями (см. подсказку в юр. отделе).",
        fieldCount: 0,
      };
    }

    const tokens = buildArrivalDocumentTokens(ctx);
    const fontBytes = await loadCyrillicFontBytes();
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

export const LEGAL_PDF_FIELD_HINTS = [
  "patient.fullName",
  "patient.birthDate",
  "patient.phone",
  "patient.passport",
  "patient.address",
  "patient.snils",
  "patient.contractNumber",
  "clinic.name",
  "clinic.inn",
  "clinic.address",
  "clinic.phone",
  "doctor.name",
  "date.today",
] as const;
