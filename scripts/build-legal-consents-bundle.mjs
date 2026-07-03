#!/usr/bin/env node
/**
 * Копирует DOCX согласий в public/legal-templates/consents/ и генерирует manifest.
 *   node scripts/build-legal-consents-bundle.mjs [путь-к-папке-ИДС]
 */
import { cp, mkdir, readdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_SRC =
  "/Users/anton/Desktop/документы для юр отдела/ИДС !!!!";
const DEST = path.join(ROOT, "public/legal-templates/consents");
const MANIFEST_TS = path.join(ROOT, "lib/legal-consents-bundle.generated.ts");

function titleFromFilename(filename) {
  return filename
    .replace(/\.docx$/i, "")
    .replace(/\+{1,}/g, "")
    .replace(/^\d+\s*/, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function storageName(filename) {
  const num = filename.match(/^(\d+)\s/);
  if (num) return `${num[1]}.docx`;
  const lower = filename.toLowerCase();
  if (lower === "идс2.docx") return "ids2.docx";
  if (lower.startsWith("отказ от медицинского")) return "otkaz-med-vmeshatelstva.docx";
  return filename
    .replace(/\.docx$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .concat(".docx");
}

async function main() {
  const src = process.argv[2] ?? DEFAULT_SRC;
  await mkdir(DEST, { recursive: true });

  const files = (await readdir(src))
    .filter((f) => f.toLowerCase().endsWith(".docx") && !f.startsWith("~$"))
    .sort((a, b) => {
      const na = Number(a.match(/^(\d+)/)?.[1] ?? 9999);
      const nb = Number(b.match(/^(\d+)/)?.[1] ?? 9999);
      if (na !== nb) return na - nb;
      return a.localeCompare(b, "ru");
    });

  const entries = [];
  for (const file of files) {
    const storage = storageName(file);
    await cp(path.join(src, file), path.join(DEST, storage));
    const slug = storage.replace(/\.docx$/i, "");
    entries.push({
      id: `legal-consent-${slug}`,
      title: titleFromFilename(file),
      templateUrl: `/legal-templates/consents/${storage}`,
      fileName: file,
    });
  }

  const body = `/** Автогенерация: scripts/build-legal-consents-bundle.mjs */
import type { LegalDocument } from "@/lib/types";
import { LEGAL_CATEGORY_CONSENTS } from "@/lib/legal-categories";

export interface LegalConsentBundleEntry {
  id: string;
  title: string;
  templateUrl: string;
  fileName: string;
}

export const LEGAL_CONSENTS_BUNDLE: LegalConsentBundleEntry[] = ${JSON.stringify(entries, null, 2)};

export function legalConsentBundleDocuments(date = new Date().toISOString().slice(0, 10)): LegalDocument[] {
  return LEGAL_CONSENTS_BUNDLE.map((e) => ({
    id: e.id,
    title: e.title,
    category: LEGAL_CATEGORY_CONSENTS,
    date,
    templateUrl: e.templateUrl,
    fileName: e.fileName,
  }));
}

export function missingLegalConsentBundleEntries(existing: LegalDocument[]): LegalConsentBundleEntry[] {
  const urls = new Set(existing.map((d) => d.templateUrl).filter(Boolean));
  const ids = new Set(existing.map((d) => d.id));
  return LEGAL_CONSENTS_BUNDLE.filter(
    (e) => !urls.has(e.templateUrl) && !ids.has(e.id)
  );
}
`;

  await writeFile(MANIFEST_TS, body, "utf8");
  console.log(`✓ ${entries.length} файлов → public/legal-templates/consents/`);
  console.log(`✓ ${MANIFEST_TS}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
