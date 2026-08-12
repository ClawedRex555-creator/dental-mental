import type { ClinicPersistedState } from "@/lib/clinic-persisted-state";
import {
  createInvoiceFromWorkAct,
  findInvoiceForAct,
  patchInvoiceFromWorkAct,
} from "@/lib/invoice-from-act";
import { derivePatientVisitFields } from "@/lib/patient-visits";
import type { Appointment, Patient, WorkAct } from "@/lib/types";
import { generateId } from "@/lib/utils";
import { getWorkActPaidAmount } from "@/lib/work-act-payment";
import { ensureMedicalRecordForWorkAct } from "@/lib/work-act-medical-record";
import { allocateNextActSequence, formatWorkActNumber } from "@/lib/work-act-number";
import { isWorkActLineFilled } from "@/lib/work-act-utils";
import {
  detachAppointmentFromWorkAct,
  removeSyntheticVisitForWorkAct,
} from "@/lib/work-act-visit";

export type ApplyWorkActCommandResult =
  | { ok: false; error: string }
  | {
      ok: true;
      state: ClinicPersistedState;
      actId: string;
      appointmentId?: string;
      alreadyApplied: boolean;
    };

function withPatientVisitFields(
  patients: Patient[],
  appointments: Appointment[],
  patientId: string
): Patient[] {
  const patient = patients.find((p) => p.id === patientId);
  if (!patient) return patients;
  const fields = derivePatientVisitFields(patient, appointments);
  return patients.map((p) => (p.id === patientId ? { ...p, ...fields } : p));
}

function workActsEqual(a: WorkAct, b: WorkAct): boolean {
  return (
    a.id === b.id &&
    a.actNumber === b.actNumber &&
    a.actDate === b.actDate &&
    a.patientId === b.patientId &&
    a.appointmentId === b.appointmentId &&
    a.doctorId === b.doctorId &&
    a.submittedToAdmin === b.submittedToAdmin &&
    a.totalAmount === b.totalAmount &&
    a.subtotalAmount === b.subtotalAmount &&
    a.discount === b.discount &&
    a.discountType === b.discountType &&
    a.discountBearer === b.discountBearer &&
    a.paymentStatus === b.paymentStatus &&
    a.notes === b.notes &&
    a.prepaymentId === b.prepaymentId &&
    a.invoiceId === b.invoiceId &&
    a.medicalRecordId === b.medicalRecordId &&
    JSON.stringify(a.items) === JSON.stringify(b.items)
  );
}

/**
 * Создать/обновить акт без полного client PUT.
 * submittedToAdmin=true — как submit: appointment → ready_for_payment.
 */
export function applyUpsertWorkActToPersistedState(
  state: ClinicPersistedState,
  actInput: WorkAct,
  options?: { linkAppointmentId?: string | null; submittedToAdmin?: boolean }
): ApplyWorkActCommandResult {
  if (!actInput.id?.trim()) {
    return { ok: false, error: "Не указан id акта" };
  }
  if (!actInput.patientId?.trim()) {
    return { ok: false, error: "Не указан пациент" };
  }
  if (!actInput.doctorId?.trim()) {
    return { ok: false, error: "Не указан врач" };
  }
  const filledItems = (actInput.items ?? []).filter(isWorkActLineFilled);
  if (filledItems.length === 0) {
    return { ok: false, error: "Добавьте услуги в акт" };
  }

  const linkAppointmentId =
    options?.linkAppointmentId === null
      ? undefined
      : (options?.linkAppointmentId ?? actInput.appointmentId)?.trim() || undefined;

  let appointment: Appointment | undefined;
  if (linkAppointmentId) {
    appointment = state.appointments.find((a) => a.id === linkAppointmentId);
    if (!appointment) {
      return { ok: false, error: "Запись не найдена" };
    }
    if (appointment.patientId !== actInput.patientId) {
      return { ok: false, error: "Пациент акта не совпадает с записью" };
    }
  }

  const existing = state.workActs.find((a) => a.id === actInput.id);
  let actNumber = actInput.actNumber?.trim() || existing?.actNumber || "";
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

  const invoiceId =
    actInput.invoiceId ?? existing?.invoiceId ?? generateId("inv");

  const submittedToAdmin =
    options?.submittedToAdmin !== undefined
      ? options.submittedToAdmin
      : (actInput.submittedToAdmin ?? existing?.submittedToAdmin);

  const nextAct: WorkAct = {
    ...existing,
    ...actInput,
    id: actInput.id,
    actNumber,
    items: filledItems,
    invoiceId,
    appointmentId: linkAppointmentId ?? actInput.appointmentId ?? existing?.appointmentId,
    submittedToAdmin,
    paymentStatus: existing?.paymentStatus ?? actInput.paymentStatus ?? "pending",
    createdAt:
      existing?.createdAt ?? actInput.createdAt ?? actInput.actDate,
    actType:
      existing?.actType === "prepayment" || actInput.actType === "prepayment"
        ? "prepayment"
        : "services",
  };

  const medicalSync = ensureMedicalRecordForWorkAct(
    nextAct,
    state.medicalRecords,
    appointment,
    state.services
  );
  const actWithMr: WorkAct = {
    ...nextAct,
    medicalRecordId:
      nextAct.medicalRecordId ?? medicalSync.actMedicalRecordId ?? medicalSync.record.id,
  };

  let appointments = state.appointments;
  if (linkAppointmentId && appointment) {
    const linked: Appointment = {
      ...appointment,
      workActId: actWithMr.id,
      ...(submittedToAdmin === true
        ? {
            status: "ready_for_payment" as const,
            paymentStatus:
              appointment.paymentStatus === "paid"
                ? appointment.paymentStatus
                : ("pending" as const),
          }
        : {}),
    };
    appointments = state.appointments.map((a) =>
      a.id === linkAppointmentId ? linked : a
    );
  }

  const appointmentOk =
    !linkAppointmentId ||
    (appointments.find((a) => a.id === linkAppointmentId)?.workActId ===
      actWithMr.id &&
      (submittedToAdmin !== true ||
        appointments.find((a) => a.id === linkAppointmentId)?.status ===
          "ready_for_payment"));

  if (
    existing &&
    workActsEqual(existing, actWithMr) &&
    appointmentOk &&
    !(state.deletedWorkActIds ?? []).includes(actWithMr.id)
  ) {
    return {
      ok: true,
      state,
      actId: actWithMr.id,
      appointmentId: linkAppointmentId,
      alreadyApplied: true,
    };
  }

  const workActs = existing
    ? state.workActs.map((a) => (a.id === actWithMr.id ? actWithMr : a))
    : [actWithMr, ...state.workActs];

  const linkedInvoice = findInvoiceForAct(state.invoices, actWithMr);
  const invoices = linkedInvoice
    ? state.invoices.map((inv) =>
        inv.id === linkedInvoice.id ? patchInvoiceFromWorkAct(inv, actWithMr) : inv
      )
    : [createInvoiceFromWorkAct(actWithMr, invoiceId), ...state.invoices];

  return {
    ok: true,
    state: {
      ...state,
      workActs,
      invoices,
      medicalRecords: medicalSync.records,
      appointments,
      actCounter: Math.max(actCounter, state.actCounter),
      patients: withPatientVisitFields(
        state.patients,
        appointments,
        actWithMr.patientId
      ),
      deletedWorkActIds: (state.deletedWorkActIds ?? []).filter(
        (id) => id !== actWithMr.id
      ),
    },
    actId: actWithMr.id,
    appointmentId: linkAppointmentId,
    alreadyApplied: false,
  };
}

/**
 * Удалить акт (как deleteWorkAct в store): платежи, счета, detach записей,
 * инверсия баланса, tombstone, unlink медкарт/предоплат.
 */
export function applyDeleteWorkActToPersistedState(
  state: ClinicPersistedState,
  actIdInput: string
): ApplyWorkActCommandResult {
  const actId = actIdInput?.trim();
  if (!actId) {
    return { ok: false, error: "Не указан id акта" };
  }

  const act = state.workActs.find((a) => a.id === actId);
  if (!act) {
    if ((state.deletedWorkActIds ?? []).includes(actId)) {
      return { ok: true, state, actId, alreadyApplied: true };
    }
    return { ok: false, error: "Акт не найден" };
  }

  const reverseAmount = getWorkActPaidAmount(state.payments, actId);

  const beforeIds = new Set(state.appointments.map((a) => a.id));
  const appointments = removeSyntheticVisitForWorkAct(
    state.appointments.map((a) => {
      const linkedByWorkActId = a.workActId === actId;
      const linkedByAppointmentId =
        act.appointmentId != null && a.id === act.appointmentId;
      if (!linkedByWorkActId && !linkedByAppointmentId) return a;
      return detachAppointmentFromWorkAct(a);
    }),
    actId
  );
  const removedAppointmentIds = [...beforeIds].filter(
    (id) => !appointments.some((a) => a.id === id)
  );

  let patients = state.patients.map((p) => {
    if (p.id !== act.patientId) return p;
    const nextBalance =
      reverseAmount > 0 ? p.balance - reverseAmount + act.totalAmount : p.balance;
    const nextSpent =
      reverseAmount > 0 ? Math.max(0, p.totalSpent - reverseAmount) : p.totalSpent;
    const status =
      nextBalance < 0
        ? ("debtor" as const)
        : p.status === "debtor" && nextBalance >= 0
          ? ("active" as const)
          : p.status;
    return {
      ...p,
      totalSpent: nextSpent,
      balance: nextBalance,
      status,
    };
  });
  patients = withPatientVisitFields(patients, appointments, act.patientId);

  return {
    ok: true,
    state: {
      ...state,
      workActs: state.workActs.filter((a) => a.id !== actId),
      deletedWorkActIds: [...new Set([...(state.deletedWorkActIds ?? []), actId])],
      deletedAppointmentIds: [
        ...new Set([...(state.deletedAppointmentIds ?? []), ...removedAppointmentIds]),
      ],
      invoices: state.invoices.filter(
        (inv) => inv.workActId !== actId && inv.id !== act.invoiceId
      ),
      payments: state.payments.filter((p) => p.workActId !== actId),
      patients,
      medicalRecords: state.medicalRecords.map((r) =>
        r.workActId === actId ? { ...r, workActId: undefined } : r
      ),
      appointments,
      prepayments: (state.prepayments ?? []).map((p) =>
        p.workActId === actId
          ? { ...p, workActId: undefined, actNumber: undefined }
          : p
      ),
    },
    actId,
    appointmentId: act.appointmentId,
    alreadyApplied: false,
  };
}
