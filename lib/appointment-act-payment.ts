import type { Appointment, Payment, WorkAct } from "@/lib/types";
import { isWorkActFullyPaid } from "@/lib/work-act-payment";

export function isWorkActAlreadyPaid(act: WorkAct, payments: Payment[]): boolean {
  if (act.paymentStatus === "paid") return true;
  return isWorkActFullyPaid(act, payments);
}

/** После оплаты акта — закрыть приём в расписании (ready_for_payment → completed) */
export function syncAppointmentsAfterActPaid(
  appointments: Appointment[],
  act: WorkAct
): Appointment[] {
  const linkedIds = new Set<string>();
  if (act.appointmentId) linkedIds.add(act.appointmentId);
  for (const apt of appointments) {
    if (apt.workActId === act.id) linkedIds.add(apt.id);
  }
  if (linkedIds.size === 0) return appointments;

  let changed = false;
  const next = appointments.map((apt) => {
    if (!linkedIds.has(apt.id)) return apt;
    if (apt.status === "completed" && apt.paymentStatus === "paid") {
      return apt.workActId ? apt : { ...apt, workActId: act.id };
    }
    changed = true;
    return {
      ...apt,
      status: "completed" as const,
      paymentStatus: "paid" as const,
      workActId: apt.workActId ?? act.id,
    };
  });
  return changed ? next : appointments;
}
