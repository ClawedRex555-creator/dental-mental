import type { LegalDocument } from "@/lib/types";

export type LegalCommandResult = {
  ok: boolean;
  alreadyApplied?: boolean;
  error?: string;
  updatedAt?: string | null;
  revision?: number | null;
};

async function postLegalCommand(
  path: string,
  body: Record<string, unknown>
): Promise<LegalCommandResult> {
  try {
    const res = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      alreadyApplied?: boolean;
      error?: string;
      updatedAt?: string | null;
      revision?: number | null;
    } | null;
    if (!res.ok || !json?.ok) {
      return { ok: false, error: json?.error ?? `HTTP ${res.status}` };
    }
    return {
      ok: true,
      alreadyApplied: Boolean(json.alreadyApplied),
      updatedAt: json.updatedAt ?? null,
      revision:
        typeof json.revision === "number" && Number.isFinite(json.revision)
          ? json.revision
          : null,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Сеть недоступна",
    };
  }
}

/** Сохранить юр. документ через command API (без полного snapshot PUT). */
export async function upsertLegalDocumentViaCommandApi(
  document: LegalDocument
): Promise<LegalCommandResult> {
  return postLegalCommand("/api/clinic/legal/upsert", { document });
}

/** Удалить юр. документ через command API. */
export async function deleteLegalDocumentViaCommandApi(
  documentId: string
): Promise<LegalCommandResult> {
  return postLegalCommand("/api/clinic/legal/delete", { documentId });
}
