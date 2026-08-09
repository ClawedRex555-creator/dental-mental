import type { ClinicPersistedState } from "@/lib/clinic-persisted-state";
import { syncAppointmentsAfterActPaid } from "@/lib/appointment-act-payment";
import { generateDefaultTeeth } from "@/lib/mock-data";
import { derivePatientVisitFields } from "@/lib/patient-visits";
import type {
  Appointment,
  MedicalRecord,
  Payment,
  PaymentMethod,
  Patient,
  ToothRecord,
  WorkAct,
} from "@/lib/types";
import {
  getWorkActPaidAmount,
  getWorkActRemainingAmount,
  isWorkActFullyPaid,
  resolvePatientBalanceAfterActPayment,
} from "@/lib/work-act-payment";
import { ensureMedicalRecordForWorkAct } from "@/lib/work-act-medical-record";
import { applyWorkActItemsToTeeth } from "@/lib/work-act-teeth";
import { syncVisitForWorkAct } from "@/lib/work-act-visit";

export function buildPayWorkActPaymentId(
  actId: string,
  alreadyPaid: number,
  payAmount: number,
  method: PaymentMethod
): string {
  return `pay_${actId}_${Math.round(alreadyPaid * 100)}_${Math.round(payAmount * 100)}_${method}`;
}

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

function applyFullyPaidState(
  state: ClinicPersistedState,
  actId: string,
  medicalSync: { records: MedicalRecord[]; actMedicalRecordId?: string }
): ClinicPersistedState {
  const workActs = state.workActs.map((a) => {
    if (a.id !== actId) return a;
    const next: WorkAct = { ...a, paymentStatus: "paid" as const };
    if (medicalSync.actMedicalRecordId) {
      next.medicalRecordId = medicalSync.actMedicalRecordId;
    }
    return next;
  });
  const paidAct = workActs.find((a) => a.id === actId)!;
  const currentTeeth =
    state.teethByPatient[paidAct.patientId] ?? generateDefaultTeeth();
  const teethWithAct =
    paidAct.actType === "prepayment"
      ? currentTeeth
      : applyWorkActItemsToTeeth(currentTeeth, paidAct.items, {
          actNumber: paidAct.actNumber,
          actDate: paidAct.actDate,
        });
  let appointments = syncVisitForWorkAct(
    state.appointments,
    paidAct,
    state.payments
  );
  appointments = syncAppointmentsAfterActPaid(appointments, paidAct);
  return {
    ...state,
    workActs,
    medicalRecords: medicalSync.records,
    appointments,
    patients: withPatientVisitFields(
      state.patients,
      appointments,
      paidAct.patientId
    ),
    ...(teethWithAct !== currentTeeth
      ? {
          teethByPatient: {
            ...state.teethByPatient,
            [paidAct.patientId]: teethWithAct,
          } as Record<string, ToothRecord[]>,
        }
      : {}),
  };
}

export type ApplyPayWorkActResult =
  | { ok: false; error: string }
  | {
      ok: true;
      state: ClinicPersistedState;
      paymentId: string;
      fullyPaid: boolean;
      alreadyApplied: boolean;
    };

/**
 * Чистая мутация снимка при оплате акта (клиент + command API).
 * paymentId детерминирован — double-submit безопасен.
 */
export function applyPayWorkActToPersistedState(
  state: ClinicPersistedState,
  input: {
    actId: string;
    method?: PaymentMethod;
    amount?: number;
    paymentId?: string;
  }
): ApplyPayWorkActResult {
  const method = input.method ?? "cash";
  const act = state.workActs.find((a) => a.id === input.actId);
  if (!act) return { ok: false, error: "Акт не найден" };

  const alreadyPaid = getWorkActPaidAmount(state.payments, input.actId);
  const remaining = getWorkActRemainingAmount(act, state.payments);

  if (remaining <= 0) {
    if (isWorkActFullyPaid(act, state.payments)) {
      const appointment = act.appointmentId
        ? state.appointments.find((a) => a.id === act.appointmentId)
        : undefined;
      const medicalSync = ensureMedicalRecordForWorkAct(
        act,
        state.medicalRecords,
        appointment,
        state.services
      );
      const existingPay =
        state.payments.find((p) => p.workActId === input.actId)?.id ?? "";
      return {
        ok: true,
        state: applyFullyPaidState(state, input.actId, medicalSync),
        paymentId: existingPay,
        fullyPaid: true,
        alreadyApplied: true,
      };
    }
    if (act.totalAmount <= 0) {
      const appointment = act.appointmentId
        ? state.appointments.find((a) => a.id === act.appointmentId)
        : undefined;
      const medicalSync = ensureMedicalRecordForWorkAct(
        act,
        state.medicalRecords,
        appointment,
        state.services
      );
      const base = applyFullyPaidState(state, input.actId, medicalSync);
      return {
        ok: true,
        state: {
          ...base,
          invoices: state.invoices.map((inv) => {
            const linked =
              inv.workActId === input.actId ||
              inv.id === act.invoiceId ||
              inv.description.includes(act.actNumber);
            if (!linked) return inv;
            return {
              ...inv,
              workActId: input.actId,
              status: "paid" as const,
              paid: 0,
            };
          }),
        },
        paymentId: "",
        fullyPaid: true,
        alreadyApplied: false,
      };
    }
    return { ok: false, error: "По акту нечего оплачивать" };
  }

  const payAmount =
    input.amount != null && input.amount > 0
      ? Math.min(input.amount, remaining)
      : remaining;
  if (payAmount <= 0) return { ok: false, error: "Сумма оплаты некорректна" };

  const newTotalPaid = alreadyPaid + payAmount;
  const fullyPaid = newTotalPaid >= act.totalAmount;
  const paymentId =
    input.paymentId ??
    buildPayWorkActPaymentId(input.actId, alreadyPaid, payAmount, method);

  if (state.payments.some((p) => p.id === paymentId)) {
    return {
      ok: true,
      state,
      paymentId,
      fullyPaid: isWorkActFullyPaid(act, state.payments),
      alreadyApplied: true,
    };
  }

  const appointment = act.appointmentId
    ? state.appointments.find((a) => a.id === act.appointmentId)
    : undefined;
  const medicalSync = fullyPaid
    ? ensureMedicalRecordForWorkAct(
        act,
        state.medicalRecords,
        appointment,
        state.services
      )
    : { records: state.medicalRecords, actMedicalRecordId: undefined };

  const invoice =
    (act.invoiceId
      ? state.invoices.find((i) => i.id === act.invoiceId)
      : undefined) ?? state.invoices.find((i) => i.workActId === input.actId);

  const payment: Payment = {
    id: paymentId,
    patientId: act.patientId,
    workActId: input.actId,
    amount: payAmount,
    method,
    status: "paid",
    date: act.actDate,
    comment: fullyPaid
      ? `Оплата по акту ${act.actNumber}`
      : `Предоплата по акту ${act.actNumber}`,
  };

  const workActs = state.workActs.map((a) => {
    if (a.id !== input.actId) return a;
    const next: WorkAct = {
      ...a,
      paymentStatus: fullyPaid ? ("paid" as const) : ("partial" as const),
    };
    if (fullyPaid && medicalSync.actMedicalRecordId) {
      next.medicalRecordId = medicalSync.actMedicalRecordId;
    }
    return next;
  });
  const paidAct = workActs.find((a) => a.id === input.actId)!;
  const paymentsNext = [payment, ...state.payments];

  let next: ClinicPersistedState = {
    ...state,
    workActs,
    payments: paymentsNext,
    medicalRecords: medicalSync.records,
  };

  let appointments = syncVisitForWorkAct(
    next.appointments,
    paidAct,
    paymentsNext
  );

  if (fullyPaid) {
    next = applyFullyPaidState(
      { ...next, appointments },
      input.actId,
      ensureMedicalRecordForWorkAct(
        act,
        state.medicalRecords,
        appointment,
        state.services
      )
    );
    appointments = next.appointments;
  } else {
    next = { ...next, appointments };
  }

  const patientBefore = state.patients.find((p) => p.id === act.patientId);
  const newBalance = resolvePatientBalanceAfterActPayment(
    patientBefore?.balance ?? 0,
    act.totalAmount,
    alreadyPaid,
    payAmount
  );

  let patients = next.patients.map((p) => {
    if (p.id !== act.patientId) return p;
    const status =
      newBalance < 0
        ? ("debtor" as const)
        : p.status === "debtor" && newBalance >= 0
          ? ("active" as const)
          : p.status;
    return {
      ...p,
      totalSpent: p.totalSpent + payAmount,
      balance: newBalance,
      status,
    };
  });
  patients = withPatientVisitFields(patients, next.appointments, act.patientId);

  return {
    ok: true,
    state: {
      ...next,
      invoices: next.invoices.map((inv) => {
        const linked =
          inv.id === invoice?.id ||
          inv.workActId === input.actId ||
          inv.description.includes(act.actNumber);
        if (!linked) return inv;
        return {
          ...inv,
          workActId: input.actId,
          status: fullyPaid ? ("paid" as const) : ("partial" as const),
          paid: newTotalPaid,
        };
      }),
      patients,
    },
    paymentId,
    fullyPaid,
    alreadyApplied: false,
  };
}
