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

function appointmentNeedsWorkActPatch(
  appointment: Appointment,
  next: Appointment
): boolean {
  return (
    next.status !== appointment.status ||
    next.paymentStatus !== appointment.paymentStatus ||
    next.workActId !== appointment.workActId ||
    next.price !== appointment.price
  );
}

function patchAppointmentForWorkAct(
  appointment: Appointment,
  act: WorkAct,
  payments: Payment[]
): Appointment {
  const paid = isWorkActAlreadyPaid(act, payments);
  let status: AppointmentStatus = appointment.status;
  if (paid || appointment.status === "completed") {
    status = "completed";
  } else if (
    appointment.status === "scheduled" ||
    appointment.status === "confirmed"
  ) {
    status = "ready_for_payment";
  }

  return {
    ...appointment,
    workActId: act.id,
    price: act.totalAmount,
    paymentStatus: paid ? "paid" : appointment.paymentStatus,
    status,
  };
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

  const linkedIds = new Set<string>();
  if (act.appointmentId) linkedIds.add(act.appointmentId);
  for (const a of appointments) {
    if (a.workActId === act.id) linkedIds.add(a.id);
  }

  if (linkedIds.size > 0) {
    let changed = false;
    const next = appointments.map((a) => {
      if (!linkedIds.has(a.id)) return a;
      const patched = patchAppointmentForWorkAct(a, act, payments);
      if (!appointmentNeedsWorkActPatch(a, patched)) return a;
      changed = true;
      return patched;
    });
    if (changed) return next;
    // Приём уже привязан и актуален — не создаём синтетический визит
    return appointments;
  }

  const visitId = workActVisitId(act.id);
  const built = buildVisitFromWorkAct(act, payments);
  const idx = appointments.findIndex((a) => a.id === visitId);
  if (idx >= 0) {
    const prev = appointments[idx]!;
    if (!appointmentNeedsWorkActPatch(prev, built) && prev.reason === built.reason) {
      return appointments;
    }
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

/** Снять с приёма привязку к акту (после удаления акта). */
export function detachAppointmentFromWorkAct(appointment: Appointment): Appointment {
  const next: Appointment = { ...appointment, workActId: undefined };
  if (appointment.paymentStatus === "paid") {
    next.paymentStatus = "pending";
  }
  if (appointment.status === "ready_for_payment") {
    next.status = "completed";
  }
  return next;
}

/** Убрать синтетические визиты и workActId по tombstone удалённых актов. */
export function detachDeletedWorkActsFromAppointments(
  appointments: Appointment[],
  deletedWorkActIds: string[] = []
): Appointment[] {
  if (!deletedWorkActIds.length) return appointments;
  const tombstones = new Set(deletedWorkActIds);
  return appointments
    .filter((a) => {
      if (!isWorkActSyntheticVisit(a)) return true;
      const actId = a.id.slice("apt-act-".length);
      return !tombstones.has(actId);
    })
    .map((a) =>
      a.workActId && tombstones.has(a.workActId)
        ? detachAppointmentFromWorkAct(a)
        : a
    );
}
