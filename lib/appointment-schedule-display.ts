import { APPOINTMENT_STATUS_COLORS, APPOINTMENT_STATUS_LABELS } from "@/lib/constants";
import type { Appointment, Payment, WorkAct } from "@/lib/types";
import { isWorkActFullyPaid } from "@/lib/work-act-payment";

/** Акт, привязанный к приёму в расписании (не предоплата). */
export function resolveAppointmentWorkAct(
  apt: Appointment,
  workActs: WorkAct[]
): WorkAct | undefined {
  if (apt.workActId) {
    const byId = workActs.find((a) => a.id === apt.workActId && a.actType !== "prepayment");
    if (byId) return byId;
  }
  return workActs.find(
    (a) => a.appointmentId === apt.id && a.actType !== "prepayment"
  );
}

export function isAppointmentPaidOnSchedule(
  apt: Appointment,
  act: WorkAct | undefined,
  payments: Payment[] = []
): boolean {
  if (apt.paymentStatus === "paid") return true;
  if (act && isWorkActFullyPaid(act, payments)) return true;
  return act?.paymentStatus === "paid";
}

export function getScheduleAppointmentStatusLabel(
  apt: Appointment,
  act: WorkAct | undefined,
  payments: Payment[] = []
): string {
  if (isAppointmentPaidOnSchedule(apt, act, payments)) return "Оплачен";
  if (apt.status === "ready_for_payment" && act) return "Готов к оплате";
  return APPOINTMENT_STATUS_LABELS[apt.status];
}

export function getScheduleAppointmentCellClass(
  apt: Appointment,
  act: WorkAct | undefined,
  payments: Payment[] = []
): string {
  if (isAppointmentPaidOnSchedule(apt, act, payments)) {
    return "bg-emerald-50 text-emerald-900 border border-emerald-200";
  }
  return APPOINTMENT_STATUS_COLORS[apt.status];
}
