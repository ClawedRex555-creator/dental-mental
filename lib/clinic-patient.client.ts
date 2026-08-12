import type { Patient } from "@/lib/types";

export type PatientCommandResult = {
  ok: boolean;
  alreadyApplied?: boolean;
  error?: string;
  updatedAt?: string | null;
  revision?: number | null;
};

/**
 * Сохранить карточку через command API (без полного snapshot PUT).
 * CAS/notify — только у вызывающего после локального apply + markSynced:
 * ранний ack поднимал revision до apply и позволял stale PUT с old FIO
 * пройти без conflict и затереть сервер.
 */
export async function upsertPatientViaCommandApi(
  patient: Patient
): Promise<PatientCommandResult> {
  try {
    const res = await fetch("/api/clinic/patients/update", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patient }),
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
