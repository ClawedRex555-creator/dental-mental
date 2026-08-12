import {
  ackClinicServerVersion,
  notifyClinicDataChanged,
} from "@/lib/clinic-data-sync.client";
import type { Patient } from "@/lib/types";

export type PatientCommandResult = {
  ok: boolean;
  alreadyApplied?: boolean;
  error?: string;
  updatedAt?: string | null;
  revision?: number | null;
};

/** Сохранить карточку через command API (без полного snapshot PUT). */
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

    const updatedAt = json.updatedAt ?? null;
    const revision =
      typeof json.revision === "number" && Number.isFinite(json.revision)
        ? json.revision
        : null;
    ackClinicServerVersion(updatedAt, revision);
    notifyClinicDataChanged();

    return {
      ok: true,
      alreadyApplied: Boolean(json.alreadyApplied),
      updatedAt,
      revision,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Сеть недоступна",
    };
  }
}
