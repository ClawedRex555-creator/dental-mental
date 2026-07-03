import type { LegalDocument } from "@/lib/types";

/** Категории юр. отдела (единый справочник) */
export const LEGAL_CATEGORY_JOURNALS = "Журналы";
export const LEGAL_CATEGORY_CONTRACTS = "Договоры";
export const LEGAL_CATEGORY_CONSENTS = "Согласия";
export const LEGAL_CATEGORY_LEDGER = "Книги учёта";
export const LEGAL_CATEGORY_ACTS = "Акты";
export const LEGAL_CATEGORY_EGISZ_REFUSAL = "Отказ от отправки данных ЕГИСЗ";
export const LEGAL_CATEGORY_OTHER = "Прочее";

export const LEGAL_CATEGORIES = [
  LEGAL_CATEGORY_JOURNALS,
  LEGAL_CATEGORY_CONTRACTS,
  LEGAL_CATEGORY_CONSENTS,
  LEGAL_CATEGORY_LEDGER,
  LEGAL_CATEGORY_ACTS,
  LEGAL_CATEGORY_EGISZ_REFUSAL,
  LEGAL_CATEGORY_OTHER,
] as const;

export type LegalCategory = (typeof LEGAL_CATEGORIES)[number];

/** Документ для печати при статусе «Пришёл» */
export interface ArrivalPrintDocument {
  id: string;
  name: string;
  kind: "contract" | "consent" | "egisz_refusal";
  fileDataUrl?: string;
  templateUrl?: string;
  fileName?: string;
  notes?: string;
}

export function legalDocumentToArrival(doc: LegalDocument): ArrivalPrintDocument | null {
  let kind: ArrivalPrintDocument["kind"] | null = null;
  if (doc.category === LEGAL_CATEGORY_CONTRACTS) kind = "contract";
  else if (doc.category === LEGAL_CATEGORY_CONSENTS) kind = "consent";
  else if (doc.category === LEGAL_CATEGORY_EGISZ_REFUSAL) kind = "egisz_refusal";
  else return null;

  return {
    id: doc.id,
    name: doc.title,
    kind,
    fileDataUrl: doc.fileDataUrl,
    templateUrl: doc.templateUrl,
    fileName: doc.fileName,
    notes: doc.notes,
  };
}

export function arrivalDocumentsFromLegal(legalDocuments: LegalDocument[]) {
  const contracts: ArrivalPrintDocument[] = [];
  const consents: ArrivalPrintDocument[] = [];
  const egiszRefusals: ArrivalPrintDocument[] = [];

  for (const doc of legalDocuments) {
    const arrival = legalDocumentToArrival(doc);
    if (!arrival) continue;
    if (arrival.kind === "contract") contracts.push(arrival);
    else if (arrival.kind === "consent") consents.push(arrival);
    else egiszRefusals.push(arrival);
  }

  return { contracts, consents, egiszRefusals };
}
