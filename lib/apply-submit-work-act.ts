import type { ClinicPersistedState } from "@/lib/clinic-persisted-state";
import {
  createInvoiceFromWorkAct,
  findInvoiceForAct,
  patchInvoiceFromWorkAct,
} from "@/lib/invoice-from-act";
import { derivePatientVisitFields } from "@/lib/patient-visits";
import type { Appointment, Patient, WorkAct } from "@/lib/types";
import { generateId } from "@/lib/utils";
import { ensureMedicalRecordForWorkAct } from "@/lib/work-act-medical-record";
import { allocateNextActSequence, formatWorkActNumber } from "@/lib/work-act-number";
import { isWorkActLineFilled } from "@/lib/work-act-utils";

export type ApplySubmitWorkActResult =
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

function workActsEqualForSubmit(a: WorkAct, b: WorkAct): boolean {
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
    JSON.stringify(a.items) === JSON.stringify(b.items)
  );
}

/**
 * Сохранить акт и отправить администратору:
 * submittedToAdmin + appointment.status = ready_for_payment.
 * Без полного client PUT (autoMerge иначе откатывает статус).
 */
export function applySubmitWorkActToPersistedState(
  state: ClinicPersistedState,
  actInput: WorkAct,
  options?: { appointmentId?: string | null }
): ApplySubmitWorkActResult {
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

  const appointmentId =
    (options?.appointmentId ?? actInput.appointmentId)?.trim() || undefined;
  if (!appointmentId) {
    return { ok: false, error: "Не указана запись для отправки акта" };
  }
  const appointment = state.appointments.find((a) => a.id === appointmentId);
  if (!appointment) {
    return { ok: false, error: "Запись не найдена" };
  }
  if (appointment.patientId !== actInput.patientId) {
    return { ok: false, error: "Пациент акта не совпадает с записью" };
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
    actInput.invoiceId ??
    existing?.invoiceId ??
    generateId("inv");

  const nextAct: WorkAct = {
    ...existing,
    ...actInput,
    id: actInput.id,
    actNumber,
    items: filledItems,
    invoiceId,
    appointmentId,
    submittedToAdmin: true,
    paymentStatus: existing?.paymentStatus ?? actInput.paymentStatus ?? "pending",
    createdAt:
      existing?.createdAt ??
      actInput.createdAt ??
      actInput.actDate,
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

  const appointmentReady: Appointment = {
    ...appointment,
    status: "ready_for_payment",
    workActId: actWithMr.id,
    paymentStatus:
      appointment.paymentStatus === "paid" ? appointment.paymentStatus : "pending",
  };

  const alreadyReady =
    Boolean(existing) &&
    workActsEqualForSubmit(
      { ...existing!, submittedToAdmin: true, appointmentId },
      actWithMr
    ) &&
    appointment.status === "ready_for_payment" &&
    appointment.workActId === actWithMr.id;

  if (alreadyReady) {
    return {
      ok: true,
      state,
      actId: actWithMr.id,
      appointmentId,
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

  const appointments = state.appointments.map((a) =>
    a.id === appointmentId ? appointmentReady : a
  );

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
    appointmentId,
    alreadyApplied: false,
  };
}
