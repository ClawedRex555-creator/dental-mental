import "server-only";

import { addDays, format } from "date-fns";
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
import type { ClinicPersistedState } from "@/lib/clinic-persisted-state";
import type { MedflexClinicConfig, MedflexScheduleCell } from "@/lib/medflex/types";

function slotEndExclusive(endTime: string): string {
  // generateTimeSlots uses exclusive end; doctor endTime is inclusive wall clock
  const endMin = toMinutes(endTime);
  const h = Math.floor(endMin / 60);
  const m = endMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Ячейки врача на N дней: free=false если занято приёмом */
export function buildDoctorScheduleCells(
  state: ClinicPersistedState,
  doctorId: string,
  days: number,
  from = new Date()
): MedflexScheduleCell[] {
  const cells: MedflexScheduleCell[] = [];
  const clinicSchedule = state.clinicSettings.weeklySchedule;

  for (let i = 0; i < days; i++) {
    const day = addDays(from, i);
    const dt = format(day, "yyyy-MM-dd");
    if (!isClinicOpenOnDate(dt, clinicSchedule)) continue;

    const doctorHours = getDoctorHoursForDate(doctorId, dt, state.doctorSchedules);
    if (!doctorHours) continue;

    const clinicHours = getClinicHoursForDate(dt, clinicSchedule);
    const start = doctorHours.startTime;
    let end = doctorHours.endTime;
    if (clinicHours) {
      if (toMinutes(start) < toMinutes(clinicHours.open)) {
        /* keep doctor start if later */
      }
      if (toMinutes(end) > toMinutes(clinicHours.close)) {
        end = clinicHours.close;
      }
    }

    const slots = generateTimeSlots(start, slotEndExclusive(end), SCHEDULE_SLOT_MINUTES);
    for (const timeStart of slots) {
      const timeEnd = calcEndTime(timeStart, SCHEDULE_SLOT_MINUTES);
      if (toMinutes(timeEnd) > toMinutes(end)) continue;
      const free = isDoctorIntervalFree(
        state.appointments,
        dt,
        timeStart,
        timeEnd,
        doctorId
      );
      cells.push({
        dt,
        time_start: timeStart,
        time_end: timeEnd,
        free,
      });
    }
  }

  return cells;
}

export function buildMedflexDoctorsSchedulePayload(
  state: ClinicPersistedState,
  config: MedflexClinicConfig,
  clinicName: string
): {
  schedule: Record<string, unknown>;
} {
  const filialId = (config.filialId || "main").trim();
  const filialName = (config.filialName || clinicName || "Филиал").trim();
  const days = config.scheduleDays ?? 30;

  const doctorsData: Record<
    string,
    { efio: string; cells: MedflexScheduleCell[] }
  > = {};

  for (const doctor of state.doctors) {
    if (doctor.status !== "active") continue;
    if (doctor.role !== "doctor") continue;
    const cells = buildDoctorScheduleCells(state, doctor.id, days);
    doctorsData[doctor.id] = {
      efio: doctor.name.trim(),
      cells,
    };
  }

  return {
    schedule: {
      [filialId]: filialName,
      data: {
        [filialId]: doctorsData,
      },
    },
  };
}

export function buildMedflexServicesSchedulePayload(
  state: ClinicPersistedState,
  config: MedflexClinicConfig,
  clinicName: string
): { schedule: Record<string, unknown> } {
  const filialId = (config.filialId || "main").trim();
  const filialName = (config.filialName || clinicName || "Филиал").trim();
  const days = config.scheduleDays ?? 30;

  const basic: Record<string, unknown> = {};
  for (const service of state.services) {
    if (service.active === false) continue;
    basic[service.id] = {
      name: service.name,
      category: service.category || "Стоматология",
      price: service.price,
      duration: SCHEDULE_SLOT_MINUTES,
      intervals: [] as unknown[],
    };
  }

  const doctors: Record<string, unknown> = {};
  for (const doctor of state.doctors) {
    if (doctor.status !== "active") continue;
    if (doctor.role !== "doctor") continue;
    const cells = buildDoctorScheduleCells(state, doctor.id, days);
    doctors[doctor.id] = {
      efio: doctor.name.trim(),
      services: state.services.filter((s) => s.active !== false).map((s) => s.id),
      intervals: cells
        .filter((c) => c.free)
        .map((c) => ({
          dt: c.dt,
          time_start: c.time_start,
          time_end: c.time_end,
          free: true,
        })),
    };
  }

  return {
    schedule: {
      [filialId]: filialName,
      data: {
        [filialId]: {
          services: { basic, additional: {} },
          doctors,
          devices: {},
        },
      },
    },
  };
}
