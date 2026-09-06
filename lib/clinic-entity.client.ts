import { ackClinicServerVersion } from "@/lib/clinic-data-sync.client";
import type {
  MedicalRecord,
  PatientNote,
  PatientPrepayment,
  TreatmentPlan,
  TreatmentPlanCase,
  WorkAct,
} from "@/lib/types";

export type EntityCommandResult = {
  ok: boolean;
  alreadyApplied?: boolean;
  error?: string;
  updatedAt?: string | null;
  revision?: number | null;
};

async function postEntityCommand(
  path: string,
  body: Record<string, unknown>
): Promise<EntityCommandResult> {
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
    const updatedAt = json.updatedAt ?? null;
    const revision =
      typeof json.revision === "number" && Number.isFinite(json.revision)
        ? json.revision
        : null;
    ackClinicServerVersion(updatedAt, revision);
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

export function upsertTreatmentPlanViaCommandApi(plan: TreatmentPlan) {
  return postEntityCommand("/api/clinic/treatment-plans/upsert", { plan });
}

export function deleteTreatmentPlanViaCommandApi(planId: string) {
  return postEntityCommand("/api/clinic/treatment-plans/delete", { planId });
}

export function upsertTreatmentPlanCaseViaCommandApi(caseItem: TreatmentPlanCase) {
  return postEntityCommand("/api/clinic/treatment-plan-cases/upsert", {
    case: caseItem,
  });
}

export function deleteTreatmentPlanCaseViaCommandApi(caseId: string) {
  return postEntityCommand("/api/clinic/treatment-plan-cases/delete", { caseId });
}

export function upsertMedicalRecordViaCommandApi(record: MedicalRecord) {
  return postEntityCommand("/api/clinic/medical-records/upsert", { record });
}

export function addPatientNoteViaCommandApi(note: PatientNote) {
  return postEntityCommand("/api/clinic/patient-notes", { note });
}

export function deletePatientNoteViaCommandApi(noteId: string) {
  return postEntityCommand("/api/clinic/patient-notes", {
    action: "delete",
    noteId,
  });
}

export function createPrepaymentViaCommandApi(input: {
  prepayment: PatientPrepayment;
  workAct: WorkAct;
}) {
  return postEntityCommand("/api/clinic/prepayments/create", input);
}

export function deletePrepaymentViaCommandApi(prepaymentId: string) {
  return postEntityCommand("/api/clinic/prepayments/delete", { prepaymentId });
}

export function settlePrepaymentViaCommandApi(input: {
  prepaymentId: string;
  workActId: string;
  itemIds: string[];
}) {
  return postEntityCommand("/api/clinic/prepayments/settle", input);
}
