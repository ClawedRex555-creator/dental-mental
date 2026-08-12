import type { ClinicPersistedState } from "@/lib/clinic-persisted-state";
import type {
  MedicalRecord,
  PatientNote,
  PatientPrepayment,
  TreatmentPlan,
  WorkAct,
} from "@/lib/types";
import { generateId } from "@/lib/utils";
import {
  createInvoiceFromWorkAct,
  findInvoiceForAct,
  patchInvoiceFromWorkAct,
} from "@/lib/invoice-from-act";
import { treatmentPlanNoteId } from "@/lib/treatment-plan-patient-note";
import { allocateNextActSequence, formatWorkActNumber } from "@/lib/work-act-number";
import { isWorkActLineFilled } from "@/lib/work-act-utils";

export type ApplyEntityResult =
  | { ok: false; error: string }
  | {
      ok: true;
      state: ClinicPersistedState;
      entityId: string;
      alreadyApplied: boolean;
    };

function stableEqual(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/** Создать/обновить план лечения. */
export function applyUpsertTreatmentPlanToPersistedState(
  state: ClinicPersistedState,
  plan: TreatmentPlan
): ApplyEntityResult {
  const id = plan.id?.trim();
  if (!id) return { ok: false, error: "Не указан план лечения" };
  if (!plan.patientId?.trim() || !plan.doctorId?.trim()) {
    return { ok: false, error: "Укажите пациента и врача" };
  }
  if (!plan.title?.trim()) return { ok: false, error: "Укажите название плана" };
  if (!Array.isArray(plan.items) || plan.items.length === 0) {
    return { ok: false, error: "Добавьте услуги в план" };
  }

  const existing = state.treatmentPlans.find((p) => p.id === id);
  if (existing && stableEqual(existing, plan)) {
    return { ok: true, state, entityId: id, alreadyApplied: true };
  }

  return {
    ok: true,
    state: {
      ...state,
      treatmentPlans: existing
        ? state.treatmentPlans.map((p) => (p.id === id ? plan : p))
        : [plan, ...state.treatmentPlans],
    },
    entityId: id,
    alreadyApplied: false,
  };
}

/** Удалить план лечения. */
export function applyDeleteTreatmentPlanToPersistedState(
  state: ClinicPersistedState,
  planId: string
): ApplyEntityResult {
  const id = planId.trim();
  if (!id) return { ok: false, error: "Не указан план" };
  if (!state.treatmentPlans.some((p) => p.id === id)) {
    return { ok: true, state, entityId: id, alreadyApplied: true };
  }
  const linkedNoteId = treatmentPlanNoteId(id);
  return {
    ok: true,
    state: {
      ...state,
      treatmentPlans: state.treatmentPlans.filter((p) => p.id !== id),
      patientNotes: state.patientNotes.filter(
        (n) => n.sourceTreatmentPlanId !== id && n.id !== linkedNoteId
      ),
      deletedTreatmentPlanIds: [
        ...new Set([...(state.deletedTreatmentPlanIds ?? []), id]),
      ],
    },
    entityId: id,
    alreadyApplied: false,
  };
}

/** Добавить/обновить запись медкарты. */
export function applyUpsertMedicalRecordToPersistedState(
  state: ClinicPersistedState,
  record: MedicalRecord
): ApplyEntityResult {
  const id = record.id?.trim();
  if (!id) return { ok: false, error: "Не указана запись медкарты" };
  if (!record.patientId?.trim() || !record.doctorId?.trim()) {
    return { ok: false, error: "Укажите пациента и врача" };
  }
  if (!record.diagnosis?.trim() || !record.treatment?.trim()) {
    return { ok: false, error: "Заполните диагноз и лечение" };
  }

  const existing = state.medicalRecords.find((r) => r.id === id);
  if (existing && stableEqual(existing, record)) {
    return { ok: true, state, entityId: id, alreadyApplied: true };
  }

  return {
    ok: true,
    state: {
      ...state,
      medicalRecords: existing
        ? state.medicalRecords.map((r) => (r.id === id ? record : r))
        : [record, ...state.medicalRecords],
    },
    entityId: id,
    alreadyApplied: false,
  };
}

/** Добавить заметку пациента. */
export function applyAddPatientNoteToPersistedState(
  state: ClinicPersistedState,
  note: PatientNote
): ApplyEntityResult {
  const id = note.id?.trim();
  if (!id) return { ok: false, error: "Не указана заметка" };
  if (!note.patientId?.trim()) return { ok: false, error: "Не указан пациент" };
  if (!note.text?.trim()) return { ok: false, error: "Пустая заметка" };

  if (state.patientNotes.some((n) => n.id === id)) {
    return { ok: true, state, entityId: id, alreadyApplied: true };
  }

  return {
    ok: true,
    state: {
      ...state,
      patientNotes: [note, ...state.patientNotes],
    },
    entityId: id,
    alreadyApplied: false,
  };
}

/** Удалить заметку пациента. */
export function applyDeletePatientNoteToPersistedState(
  state: ClinicPersistedState,
  noteId: string
): ApplyEntityResult {
  const id = noteId.trim();
  if (!id) return { ok: false, error: "Не указана заметка" };
  if (!state.patientNotes.some((n) => n.id === id)) {
    return { ok: true, state, entityId: id, alreadyApplied: true };
  }
  return {
    ok: true,
    state: {
      ...state,
      patientNotes: state.patientNotes.filter((n) => n.id !== id),
    },
    entityId: id,
    alreadyApplied: false,
  };
}

export type CreatePrepaymentCommandInput = {
  prepayment: PatientPrepayment;
  workAct: WorkAct;
};

/**
 * Создать предоплату + акт-аванс + счёт одним command apply.
 * Иначе три локальных set() + PUT гоняются с другими вкладками.
 */
export function applyCreatePrepaymentToPersistedState(
  state: ClinicPersistedState,
  input: CreatePrepaymentCommandInput
): ApplyEntityResult {
  const prep = input.prepayment;
  const actInput = input.workAct;
  const prepId = prep.id?.trim();
  const actId = actInput.id?.trim();
  if (!prepId || !actId) return { ok: false, error: "Не указаны id предоплаты/акта" };
  if (!prep.patientId?.trim() || prep.patientId !== actInput.patientId) {
    return { ok: false, error: "Пациент предоплаты не совпадает с актом" };
  }
  const filledItems = (actInput.items ?? []).filter(isWorkActLineFilled);
  if (filledItems.length === 0) {
    return { ok: false, error: "Добавьте услуги в акт предоплаты" };
  }

  if (
    state.prepayments.some((p) => p.id === prepId) &&
    state.workActs.some((a) => a.id === actId)
  ) {
    return { ok: true, state, entityId: prepId, alreadyApplied: true };
  }

  let actNumber = actInput.actNumber?.trim() || "";
  let actCounter = state.actCounter;
  if (!actNumber) {
    const seq = allocateNextActSequence(
      state.workActs,
      state.prepayments ?? [],
      state.actCounter
    );
    actNumber = formatWorkActNumber(seq);
    actCounter = seq + 1;
  }

  const invoiceId = actInput.invoiceId ?? generateId("inv");
  const nextAct: WorkAct = {
    ...actInput,
    id: actId,
    actNumber,
    items: filledItems,
    invoiceId,
    actType: "prepayment",
    prepaymentId: prepId,
    paymentStatus: actInput.paymentStatus ?? "pending",
  };

  const nextPrep: PatientPrepayment = {
    ...prep,
    id: prepId,
    workActId: actId,
    actNumber,
  };

  const linkedInvoice = findInvoiceForAct(state.invoices, nextAct);
  const invoices = linkedInvoice
    ? state.invoices.map((inv) =>
        inv.id === linkedInvoice.id ? patchInvoiceFromWorkAct(inv, nextAct) : inv
      )
    : [createInvoiceFromWorkAct(nextAct, invoiceId), ...state.invoices];

  return {
    ok: true,
    state: {
      ...state,
      workActs: [nextAct, ...state.workActs.filter((a) => a.id !== actId)],
      prepayments: [nextPrep, ...(state.prepayments ?? []).filter((p) => p.id !== prepId)],
      invoices,
      actCounter: Math.max(actCounter, state.actCounter),
      deletedWorkActIds: (state.deletedWorkActIds ?? []).filter((id) => id !== actId),
    },
    entityId: prepId,
    alreadyApplied: false,
  };
}
