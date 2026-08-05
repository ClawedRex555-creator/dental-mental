import "server-only";

import {
  calcEndTime,
  generateTimeSlots,
  isDoctorIntervalFree,
  SCHEDULE_SLOT_MINUTES,
  toMinutes,
} from "@/lib/appointment-utils";
import {
  getClinicHoursForDate,
  getDoctorHoursForDate,
  isClinicOpenOnDate,
} from "@/lib/clinic-schedule";
import { loadClinicSnapshot } from "@/lib/mobile-clinic-context.server";
import type { ClinicPersistedState } from "@/lib/clinic-persisted-state";

function slotEndExclusive(endTime: string): string {
  const endMin = toMinutes(endTime);
  const h = Math.floor(endMin / 60);
  const m = endMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function isPendingOnlineBooking(
  state: ClinicPersistedState,
  date: string,
  time: string,
  doctorId?: string
): boolean {
  return state.onlineBookings.some((b) => {
    if (b.date !== date) return false;
    if (b.time !== time) return false;
    if (b.status === "cancelled") return false;
    if (doctorId && b.doctorId && b.doctorId !== doctorId) return false;
    return true;
  });
}

/** Свободные слоты для мобильной записи (синхрон с расписанием МИС). */
export async function getMobileAvailableSlots(
  clinicId: string,
  date: string,
  doctorId?: string | null
): Promise<{ freeSlots: string[]; busySlots: string[] }> {
  const record = await loadClinicSnapshot(clinicId);
  const state = record?.data;
  if (!state) {
    return { freeSlots: [], busySlots: [] };
  }

  const clinicSchedule = state.clinicSettings.weeklySchedule;
  if (!isClinicOpenOnDate(date, clinicSchedule)) {
    return { freeSlots: [], busySlots: [] };
  }

  const clinicHours = getClinicHoursForDate(date, clinicSchedule);
  if (!clinicHours) {
    return { freeSlots: [], busySlots: [] };
  }

  const doctors = state.doctors.filter(
    (d) =>
      d.status === "active" &&
      (d.role === "doctor" || !d.role) &&
      (!doctorId || d.id === doctorId)
  );

  if (doctors.length === 0) {
    const slots = generateTimeSlots(
      clinicHours.open,
      slotEndExclusive(clinicHours.close),
      SCHEDULE_SLOT_MINUTES
    );
    const freeSlots: string[] = [];
    const busySlots: string[] = [];
    for (const time of slots) {
      const end = calcEndTime(time, SCHEDULE_SLOT_MINUTES);
      const anyOverlap = state.appointments.some((a) => {
        if (a.date !== date || a.status === "cancelled" || a.isOtherClinicVisit) {
          return false;
        }
        const aStart = toMinutes(a.startTime);
        const aEnd = toMinutes(
          a.endTime || calcEndTime(a.startTime, a.durationMinutes ?? 30)
        );
        const s = toMinutes(time);
        const e = toMinutes(end);
        return s < aEnd && aStart < e;
      });
      const busyOnline = isPendingOnlineBooking(state, date, time);
      if (anyOverlap || busyOnline) {
        busySlots.push(time);
      } else {
        freeSlots.push(time);
      }
    }
    return { freeSlots, busySlots };
  }

  const freeSet = new Set<string>();
  const busySet = new Set<string>();

  for (const doctor of doctors) {
    const doctorHours = getDoctorHoursForDate(
      doctor.id,
      date,
      state.doctorSchedules
    );
    if (!doctorHours) continue;

    let start = doctorHours.startTime;
    let end = doctorHours.endTime;
    if (toMinutes(start) < toMinutes(clinicHours.open)) {
      start = clinicHours.open;
    }
    if (toMinutes(end) > toMinutes(clinicHours.close)) {
      end = clinicHours.close;
    }

    const slots = generateTimeSlots(
      start,
      slotEndExclusive(end),
      SCHEDULE_SLOT_MINUTES
    );

    for (const time of slots) {
      const slotEnd = calcEndTime(time, SCHEDULE_SLOT_MINUTES);
      if (toMinutes(slotEnd) > toMinutes(end)) continue;

      const freeDoctor = isDoctorIntervalFree(
        state.appointments,
        date,
        time,
        slotEnd,
        doctor.id
      );
      const busyOnline = isPendingOnlineBooking(state, date, time, doctor.id);

      if (freeDoctor && !busyOnline) {
        freeSet.add(time);
      } else {
        busySet.add(time);
      }
    }
  }

  // Slot free if any doctor free; remove from busy when free
  for (const t of freeSet) {
    busySet.delete(t);
  }

  const freeSlots = [...freeSet].sort();
  const busySlots = [...busySet].sort();
  return { freeSlots, busySlots };
}

export async function assertMobileSlotAvailable(
  clinicId: string,
  date: string,
  time: string,
  doctorId?: string | null
): Promise<void> {
  const { freeSlots } = await getMobileAvailableSlots(clinicId, date, doctorId);
  if (!freeSlots.includes(time)) {
    throw new Error("Выбранное время уже занято. Выберите другой слот.");
  }
}
