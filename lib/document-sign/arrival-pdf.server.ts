import "server-only";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  buildArrivalDocumentsPrintHtml,
  buildArrivalDocumentTokens,
  isDocxArrivalDocument,
  isPdfArrivalDocument,
  type ArrivalDocumentContext,
} from "@/lib/arrival-documents";
import type { ArrivalPrintDocument } from "@/lib/legal-categories";
import { fillLegalDocxToPrintHtml } from "@/lib/legal-docx-fill";
import { fillLegalPdf, mergePdfByteArrays } from "@/lib/legal-pdf-fill";
import { resolveArrivalDocumentDataUrl } from "@/lib/resolve-legal-document-source";

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function htmlToSimplePdf(title: string, html: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595, 842]);
  const margin = 48;
  const maxWidth = page.getWidth() - margin * 2;
  let y = page.getHeight() - margin;

  page.drawText(title, { x: margin, y, size: 14, font, color: rgb(0.1, 0.1, 0.1) });
  y -= 28;

  const text = stripHtml(html);
  const words = text.split(/\s+/);
  let line = "";
  const lineHeight = 14;

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    const width = font.widthOfTextAtSize(candidate, 11);
    if (width > maxWidth && line) {
      page.drawText(line, { x: margin, y, size: 11, font, color: rgb(0.15, 0.15, 0.15) });
      y -= lineHeight;
      line = word;
      if (y < margin) break;
    } else {
      line = candidate;
    }
  }
  if (line && y >= margin) {
    page.drawText(line, { x: margin, y, size: 11, font, color: rgb(0.15, 0.15, 0.15) });
  }

  return pdf.save();
}

export interface ArrivalPdfBuildResult {
  ok: boolean;
  pdfBytes?: Uint8Array;
  error?: string;
}

export async function buildArrivalDocumentPdf(
  doc: ArrivalPrintDocument,
  ctx: ArrivalDocumentContext,
  options?: { sendToEgisz?: "yes" | "no" }
): Promise<ArrivalPdfBuildResult> {
  if (isPdfArrivalDocument(doc)) {
    const dataUrl = await resolveArrivalDocumentDataUrl(doc);
    if (!dataUrl) {
      return { ok: false, error: `${doc.name}: файл не прикреплён` };
    }
    const result = await fillLegalPdf(dataUrl, ctx);
    if (!result.ok) {
      return { ok: false, error: `${doc.name}: ${result.error}` };
    }
    return { ok: true, pdfBytes: result.bytes };
  }

  if (isDocxArrivalDocument(doc)) {
    const dataUrl = await resolveArrivalDocumentDataUrl(doc);
    if (!dataUrl) {
      return { ok: false, error: `${doc.name}: файл не прикреплён` };
    }
    const result = await fillLegalDocxToPrintHtml(
      dataUrl,
      ctx,
      doc.fileName ?? doc.name
    );
    if (!result.ok) {
      return { ok: false, error: `${doc.name}: ${result.error}` };
    }
    const bytes = await htmlToSimplePdf(doc.name, result.bodyHtml);
    return { ok: true, pdfBytes: bytes };
  }

  if (doc.fileDataUrl?.startsWith("data:image/")) {
    return {
      ok: false,
      error: `${doc.name}: для подписи по SMS прикрепите PDF-шаблон`,
    };
  }

  const bundle = buildArrivalDocumentsPrintHtml({
    documents: [doc],
    ctx,
    sendToEgisz: options?.sendToEgisz ?? "yes",
  });
  const bodyMatch = bundle.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const inner = (bodyMatch?.[1] ?? bundle)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .trim();
  const bytes = await htmlToSimplePdf(doc.name, inner);
  return { ok: true, pdfBytes: bytes };
}

export async function buildArrivalDocumentsMergedPdf(input: {
  documents: ArrivalPrintDocument[];
  ctx: ArrivalDocumentContext;
  sendToEgisz?: "yes" | "no";
}): Promise<{ ok: true; pdfBytes: Uint8Array } | { ok: false; errors: string[] }> {
  const parts: Uint8Array[] = [];
  const errors: string[] = [];

  for (const doc of input.documents) {
    const built = await buildArrivalDocumentPdf(doc, input.ctx, {
      sendToEgisz: input.sendToEgisz,
    });
    if (!built.ok || !built.pdfBytes) {
      errors.push(built.error ?? `${doc.name}: не удалось подготовить PDF`);
      continue;
    }
    parts.push(built.pdfBytes);
  }

  if (parts.length === 0) {
    return { ok: false, errors };
  }

  const merged = parts.length === 1 ? parts[0]! : await mergePdfByteArrays(parts);
  return { ok: true, pdfBytes: merged };
}

export function buildArrivalContextFromClinic(input: {
  patient: ArrivalDocumentContext["patient"];
  clinic: ArrivalDocumentContext["clinic"];
  doctor?: ArrivalDocumentContext["doctor"];
  appointmentDate?: string;
}): ArrivalDocumentContext {
  buildArrivalDocumentTokens({
    patient: input.patient,
    clinic: input.clinic,
    doctor: input.doctor,
    appointmentDate: input.appointmentDate,
  });
  return input;
}
