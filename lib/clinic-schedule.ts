import { addMonths, format, parseISO, startOfMonth } from "date-fns";
import type {
  ClinicWeeklySchedule,
  DayWorkHours,
  DoctorMonthSchedule,
  DoctorShiftDay,
} from "@/lib/types";

export const WEEKDAY_KEYS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;

export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

export const WEEKDAY_LABELS: Record<WeekdayKey, string> = {
  mon: "Пн",
  tue: "Вт",
  wed: "Ср",
  thu: "Чт",
  fri: "Пт",
  sat: "Сб",
  sun: "Вс",
};

export function defaultDayHours(): DayWorkHours {
  return { closed: false, open: "10:00", close: "19:00" };
}

export function defaultWeeklySchedule(): ClinicWeeklySchedule {
  return {
    mon: defaultDayHours(),
    tue: defaultDayHours(),
    wed: defaultDayHours(),
    thu: defaultDayHours(),
    fri: defaultDayHours(),
    sat: { closed: true, open: "10:00", close: "16:00" },
    sun: { closed: true, open: "10:00", close: "16:00" },
  };
}

/** Битый snapshot из БД не должен ронять форму настроек */
export function normalizeWeeklySchedule(
  raw?: ClinicWeeklySchedule | null
): ClinicWeeklySchedule {
  const base = defaultWeeklySchedule();
  if (!raw || typeof raw !== "object") return base;
  const out = { ...base };
  for (const key of WEEKDAY_KEYS) {
    const d = raw[key];
    if (d && typeof d === "object") {
      out[key] = { ...base[key], ...d };
    }
  }
  return out;
}

export function formatWeeklyScheduleSummary(schedule: ClinicWeeklySchedule): string {
  return WEEKDAY_KEYS.map((key) => {
    const d = schedule[key];
    if (d.closed) return `${WEEKDAY_LABELS[key]}: выходной`;
    return `${WEEKDAY_LABELS[key]}: ${d.open ?? "10:00"}–${d.close ?? "19:00"}`;
  }).join("; ");
}

/** День недели date → ключ расписания (Пн=mon) */
export function weekdayKeyFromDate(date: Date): WeekdayKey {
  const day = date.getDay();
  const map: WeekdayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return map[day];
}

export function isClinicOpenOnDate(
  dateStr: string,
  schedule?: ClinicWeeklySchedule
): boolean {
  if (!schedule) return true;
  const key = weekdayKeyFromDate(parseISO(dateStr));
  const day = schedule[key];
  return !day.closed;
}

export function getClinicHoursForDate(
  dateStr: string,
  schedule?: ClinicWeeklySchedule
): { open: string; close: string } | null {
  if (!schedule) return { open: "10:00", close: "19:00" };
  const key = weekdayKeyFromDate(parseISO(dateStr));
  const day = schedule[key];
  if (day.closed) return null;
  return { open: day.open ?? "10:00", close: day.close ?? "19:00" };
}

export function monthKey(date = new Date()): string {
  return format(date, "yyyy-MM");
}

export function nextMonthKey(from = new Date()): string {
  return format(addMonths(startOfMonth(from), 1), "yyyy-MM");
}

const DEFAULT_SHIFT_START = "10:00";
const DEFAULT_SHIFT_END = "19:00";

export function normalizeShiftDay(
  value: boolean | DoctorShiftDay | undefined,
  fallback?: { startTime: string; endTime: string }
): DoctorShiftDay {
  const start = fallback?.startTime ?? DEFAULT_SHIFT_START;
  const end = fallback?.endTime ?? DEFAULT_SHIFT_END;
  if (value === undefined) {
    return { working: true, startTime: start, endTime: end };
  }
  if (typeof value === "boolean") {
    return {
      working: value,
      startTime: start,
      endTime: end,
    };
  }
  return {
    working: value.working,
    startTime: value.startTime || start,
    endTime: value.endTime || end,
  };
}

export function getDoctorShiftForDate(
  doctorId: string,
  dateStr: string,
  schedules: DoctorMonthSchedule[]
): DoctorShiftDay {
  const mk = dateStr.slice(0, 7);
  const entry = schedules.find((s) => s.doctorId === doctorId && s.month === mk);
  if (!entry) {
    return { working: true, startTime: DEFAULT_SHIFT_START, endTime: DEFAULT_SHIFT_END };
  }
  return normalizeShiftDay(entry.days[dateStr]);
}

export function isDoctorWorkingOnDate(
  doctorId: string,
  dateStr: string,
  schedules: DoctorMonthSchedule[]
): boolean {
  return getDoctorShiftForDate(doctorId, dateStr, schedules).working;
}

export function getDoctorHoursForDate(
  doctorId: string,
  dateStr: string,
  schedules: DoctorMonthSchedule[]
): { startTime: string; endTime: string } | null {
  const shift = getDoctorShiftForDate(doctorId, dateStr, schedules);
  if (!shift.working) return null;
  return { startTime: shift.startTime, endTime: shift.endTime };
}

export function needsScheduleReminder(
  schedules: DoctorMonthSchedule[],
  doctorIds: string[]
): { month: string; missingDoctorIds: string[] } | null {
  const target = nextMonthKey();
  const missing = doctorIds.filter(
    (id) => !schedules.some((s) => s.doctorId === id && s.month === target)
  );
  if (missing.length === 0) return null;
  return { month: target, missingDoctorIds: missing };
}
