import type { Appointment, AppointmentStatus, Payment, WorkAct } from "./types";
import { isWorkActAlreadyPaid } from "./appointment-act-payment";

export function workActVisitId(actId: string): string {
  return `apt-act-${actId}`;
}

export function isWorkActSyntheticVisit(appointment: Appointment): boolean {
  return appointment.id.startsWith("apt-act-");
}

function servicesSummary(act: WorkAct): string {
  const parts = act.items.map((i) => {
    const q = i.quantity > 1 ? ` ×${i.quantity}` : "";
    return `${i.serviceName}${q}`;
  });
  const text = parts.join(", ");
  return text.length > 180 ? `${text.slice(0, 177)}…` : text;
}

function visitStatusForAct(act: WorkAct, payments: Payment[]): AppointmentStatus {
  if (isWorkActAlreadyPaid(act, payments)) return "completed";
  return "ready_for_payment";
}

export function buildVisitFromWorkAct(
  act: WorkAct,
  payments: Payment[] = []
): Appointment {
  const paid = isWorkActAlreadyPaid(act, payments);
  const summary = servicesSummary(act);
  return {
    id: workActVisitId(act.id),
    patientId: act.patientId,
    doctorId: act.doctorId,
    date: act.actDate,
    startTime: "12:00",
    endTime: "12:00",
    durationMinutes: 0,
    status: visitStatusForAct(act, payments),
    reason: summary
      ? `Акт № ${act.actNumber}: ${summary}`
      : `Акт № ${act.actNumber}`,
    complaints: act.notes,
    price: act.totalAmount,
    paymentStatus: paid ? "paid" : act.paymentStatus,
    workActId: act.id,
  };
}

/** Запись в истории визитов для акта (без приёма в расписании — синтетический визит). */
export function syncVisitForWorkAct(
  appointments: Appointment[],
  act: WorkAct,
  payments: Payment[] = []
): Appointment[] {
  if (act.actType === "prepayment") return appointments;

  if (act.appointmentId) {
    const linked = appointments.find((a) => a.id === act.appointmentId);
    if (linked) {
      const paid = isWorkActAlreadyPaid(act, payments);
      return appointments.map((a) => {
        if (a.id !== act.appointmentId) return a;
        const status =
          paid || a.status === "completed"
            ? ("completed" as const)
            : a.status === "scheduled" || a.status === "confirmed"
              ? ("ready_for_payment" as const)
              : a.status;
        return {
          ...a,
          workActId: act.id,
          price: act.totalAmount,
          paymentStatus: paid ? ("paid" as const) : a.paymentStatus,
          status,
        };
      });
    }
  }

  const visitId = workActVisitId(act.id);
  const built = buildVisitFromWorkAct(act, payments);
  const idx = appointments.findIndex((a) => a.id === visitId);
  if (idx >= 0) {
    return appointments.map((a, i) => (i === idx ? { ...a, ...built } : a));
  }
  return [built, ...appointments];
}

export function removeSyntheticVisitForWorkAct(
  appointments: Appointment[],
  actId: string
): Appointment[] {
  return appointments.filter((a) => a.id !== workActVisitId(actId));
}
