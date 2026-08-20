import type { ClinicPersistedState } from "@/lib/clinic-persisted-state";
import type { LegalDocument } from "@/lib/types";

export type ApplyLegalResult =
  | { ok: false; error: string }
  | {
      ok: true;
      state: ClinicPersistedState;
      documentId: string;
      alreadyApplied: boolean;
    };

export function normalizeLegalDocument(doc: LegalDocument): LegalDocument {
  const title = doc.title?.trim() || "";
  const category = doc.category?.trim() || "";
  const date = doc.date?.trim() || new Date().toISOString().slice(0, 10);
  const fileName =
    typeof doc.fileName === "string" && doc.fileName.trim()
      ? doc.fileName.trim()
      : undefined;
  const notes =
    typeof doc.notes === "string" && doc.notes.trim() ? doc.notes.trim() : undefined;
  const templateUrl =
    typeof doc.templateUrl === "string" && doc.templateUrl.trim()
      ? doc.templateUrl.trim()
      : undefined;
  const fileDataUrl =
    typeof doc.fileDataUrl === "string" && doc.fileDataUrl.length > 0
      ? doc.fileDataUrl
      : undefined;

  return {
    id: doc.id.trim(),
    title,
    category,
    date,
    ...(fileName ? { fileName } : {}),
    ...(notes ? { notes } : {}),
    ...(templateUrl ? { templateUrl } : {}),
    ...(fileDataUrl ? { fileDataUrl } : {}),
  };
}

function legalDocumentsEqual(a: LegalDocument, b: LegalDocument): boolean {
  try {
    return (
      JSON.stringify(normalizeLegalDocument(a)) ===
      JSON.stringify(normalizeLegalDocument(b))
    );
  } catch {
    return false;
  }
}

/** Создать/обновить юр. документ в снимке (клиент побеждает для этого id). */
export function applyUpsertLegalDocumentToPersistedState(
  state: ClinicPersistedState,
  document: LegalDocument
): ApplyLegalResult {
  const id = document.id?.trim();
  if (!id) return { ok: false, error: "Не указан документ" };

  const normalized = normalizeLegalDocument({ ...document, id });
  if (!normalized.title) {
    return { ok: false, error: "Укажите название документа" };
  }
  if (!normalized.category) {
    return { ok: false, error: "Укажите категорию документа" };
  }

  const existing = state.legalDocuments.find((d) => d.id === id);
  if (existing && legalDocumentsEqual(existing, normalized)) {
    return {
      ok: true,
      state,
      documentId: id,
      alreadyApplied: true,
    };
  }

  return {
    ok: true,
    state: {
      ...state,
      legalDocuments: existing
        ? state.legalDocuments.map((d) => (d.id === id ? normalized : d))
        : [normalized, ...state.legalDocuments],
      deletedLegalDocumentIds: (state.deletedLegalDocumentIds ?? []).filter(
        (tombstoneId) => tombstoneId !== id
      ),
    },
    documentId: id,
    alreadyApplied: false,
  };
}

/** Удалить юр. документ и поставить tombstone. */
export function applyDeleteLegalDocumentToPersistedState(
  state: ClinicPersistedState,
  documentId: string
): ApplyLegalResult {
  const id = documentId?.trim();
  if (!id) return { ok: false, error: "Не указан документ" };

  const exists = state.legalDocuments.some((d) => d.id === id);
  const alreadyTombstoned = (state.deletedLegalDocumentIds ?? []).includes(id);
  if (!exists) {
    if (alreadyTombstoned) {
      return { ok: true, state, documentId: id, alreadyApplied: true };
    }
    return { ok: false, error: "Документ не найден" };
  }

  return {
    ok: true,
    state: {
      ...state,
      legalDocuments: state.legalDocuments.filter((d) => d.id !== id),
      deletedLegalDocumentIds: [
        ...new Set([...(state.deletedLegalDocumentIds ?? []), id]),
      ],
    },
    documentId: id,
    alreadyApplied: false,
  };
}
