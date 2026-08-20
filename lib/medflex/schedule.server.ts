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
import { getClinicBillableServices } from "@/lib/service-categories";
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

  /** Техническая не уходит в ПроДокторов / MedFlex */
  const billableServices = getClinicBillableServices(state.services).filter(
    (s) => s.active !== false && Number(s.price) > 0
  );
  const billableServiceIds = billableServices.map((s) => s.id);

  const basic: Record<string, unknown> = {};
  for (const service of billableServices) {
    const nmu = service.nmuCode?.trim();
    basic[service.id] = {
      name: service.name,
      category: service.category || "Стоматология",
      // MedFlex: government_code опционален; без кода — null
      government_code: nmu || null,
      price: Number(service.price),
      duration: SCHEDULE_SLOT_MINUTES,
      // На каждой basic-услуге: список доп. услуг [{id, required}] или []
      additional_services: [] as Array<{ id: string; required: boolean }>,
      // Ячейки на услуге не шлём — слоты уходят в doctors.intervals
      intervals: [] as unknown[],
    };
  }

  const doctors: Record<string, unknown> = {};
  for (const doctor of state.doctors) {
    if (doctor.status !== "active") continue;
    if (doctor.role !== "doctor") continue;
    const cells = buildDoctorScheduleCells(state, doctor.id, days);
    // Без интервалов MedFlex не привязывает врача к каталогу услуг
    if (cells.length === 0) continue;
    doctors[doctor.id] = {
      efio: doctor.name.trim(),
      services: billableServiceIds,
      // Как в doctors/send_schedule: и free, и занятые слоты
      intervals: cells.map((c) => ({
        dt: c.dt,
        time_start: c.time_start,
        time_end: c.time_end,
        free: c.free,
      })),
    };
  }

  return {
    schedule: {
      [filialId]: filialName,
      data: {
        [filialId]: {
          // top-level additional — пустой объект; additional_services[] — на каждой услуге в basic
          services: { basic, additional: {} },
          doctors,
          devices: {},
        },
      },
    },
  };
}
