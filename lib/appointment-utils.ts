import { addMinutes, format, parse } from "date-fns";
import type { Appointment } from "./types";

export const SCHEDULE_SLOT_MINUTES = 30;
export const SCHEDULE_DAY_START = "10:00";
export const SCHEDULE_DAY_END = "20:00";

export function generateTimeSlots(
  start = SCHEDULE_DAY_START,
  end = SCHEDULE_DAY_END,
  stepMinutes = SCHEDULE_SLOT_MINUTES
): string[] {
  const slots: string[] = [];
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let cursor = sh * 60 + sm;
  const endMin = eh * 60 + em;
  while (cursor < endMin) {
    const h = Math.floor(cursor / 60);
    const m = cursor % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    cursor += stepMinutes;
  }
  return slots;
}

export function calcEndTime(startTime: string, durationMinutes: number): string {
  const base = parse(startTime, "HH:mm", new Date());
  return format(addMinutes(base, durationMinutes), "HH:mm");
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function getAppointmentEndMinutes(apt: Appointment): number {
  if (apt.endTime) return toMinutes(apt.endTime);
  return toMinutes(apt.startTime) + (apt.durationMinutes ?? 30);
}

/** Активные записи занимают слот (отменённые — нет) */
export function isAppointmentActive(apt: Appointment): boolean {
  return apt.status !== "cancelled";
}

export function timeRangesOverlap(
  date: string,
  startTime: string,
  endTime: string,
  other: Appointment
): boolean {
  if (other.date !== date || !isAppointmentActive(other)) return false;
  const aStart = toMinutes(startTime);
  const aEnd = toMinutes(endTime);
  const bStart = toMinutes(other.startTime);
  const bEnd = getAppointmentEndMinutes(other);
  return aStart < bEnd && bStart < aEnd;
}

export type AppointmentConflictKind = "doctor" | "cabinet" | "patient";

export interface AppointmentConflict {
  kind: AppointmentConflictKind;
  appointment: Appointment;
}

export function findAppointmentConflicts(
  appointments: Appointment[],
  candidate: {
    date: string;
    startTime: string;
    endTime: string;
    doctorId?: string;
    cabinetId?: string;
    patientId?: string;
    excludeId?: string;
  }
): AppointmentConflict[] {
  const found: AppointmentConflict[] = [];

  for (const apt of appointments) {
    if (apt.id === candidate.excludeId) continue;
    if (!timeRangesOverlap(candidate.date, candidate.startTime, candidate.endTime, apt)) {
      continue;
    }

    if (candidate.doctorId && apt.doctorId === candidate.doctorId) {
      found.push({ kind: "doctor", appointment: apt });
      continue;
    }
    if (candidate.cabinetId && apt.cabinetId === candidate.cabinetId) {
      found.push({ kind: "cabinet", appointment: apt });
      continue;
    }
    if (candidate.patientId && apt.patientId === candidate.patientId) {
      found.push({ kind: "patient", appointment: apt });
    }
  }

  return found;
}

export function isDoctorIntervalFree(
  appointments: Appointment[],
  date: string,
  startTime: string,
  endTime: string,
  doctorId: string,
  excludeId?: string
): boolean {
  return !appointments.some(
    (a) =>
      a.id !== excludeId &&
      a.doctorId === doctorId &&
      timeRangesOverlap(date, startTime, endTime, a)
  );
}

export function appointmentBlocksSlot(
  apt: Appointment,
  date: string,
  slotTime: string,
  doctorId?: string
): boolean {
  if (apt.date !== date) return false;
  if (doctorId && apt.doctorId && apt.doctorId !== doctorId) return false;
  if (apt.status === "cancelled") return false;

  const start = toMinutes(apt.startTime);
  const end = toMinutes(apt.endTime || apt.startTime);
  const slot = toMinutes(slotTime);
  const duration = apt.durationMinutes ?? 30;
  const aptEnd = end > start ? end : start + duration;

  return slot >= start && slot < aptEnd;
}

export function isSlotFree(
  appointments: Appointment[],
  date: string,
  slotTime: string,
  doctorId: string,
  excludeId?: string
): boolean {
  const endTime = calcEndTime(slotTime, SCHEDULE_SLOT_MINUTES);
  return isDoctorIntervalFree(appointments, date, slotTime, endTime, doctorId, excludeId);
}
