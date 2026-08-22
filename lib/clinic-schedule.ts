import { addMonths, format, parse, parseISO, startOfDay, startOfMonth } from "date-fns";
import { ru } from "date-fns/locale";
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

/** С какого числа месяца напоминать о графике на следующий */
export const SCHEDULE_REMINDER_FROM_DAY = 21;

export function shouldPromptForNextMonthSchedule(from = new Date()): boolean {
  return startOfDay(from).getDate() >= SCHEDULE_REMINDER_FROM_DAY;
}

export function formatScheduleMonthLabel(monthKey: string): string {
  const date = parse(`${monthKey}-01`, "yyyy-MM-dd", new Date());
  const label = format(date, "LLLL yyyy", { locale: ru });
  return label.charAt(0).toUpperCase() + label.slice(1);
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
    // График на месяц не задан — сетка 10–19 как раньше.
    return { working: true, startTime: DEFAULT_SHIFT_START, endTime: DEFAULT_SHIFT_END };
  }
  // День явно не отмечен: считаем рабочим с дефолтными часами (как в форме графика).
  // Явный выходной / смена — только если день есть в days.
  return normalizeShiftDay(entry.days[dateStr]);
}

export function hasDoctorMonthSchedule(
  doctorId: string,
  dateStrOrMonth: string,
  schedules: DoctorMonthSchedule[]
): boolean {
  const mk = dateStrOrMonth.slice(0, 7);
  return schedules.some((s) => s.doctorId === doctorId && s.month === mk);
}

/** Врачи без графика на указанный месяц (yyyy-MM или любая дата этого месяца). */
export function missingDoctorSchedulesForMonth(
  schedules: DoctorMonthSchedule[],
  doctorIds: string[],
  monthOrDate: string
): { month: string; missingDoctorIds: string[] } | null {
  if (doctorIds.length === 0) return null;
  const month = monthOrDate.slice(0, 7);
  const missing = doctorIds.filter(
    (id) => !schedules.some((s) => s.doctorId === id && s.month === month)
  );
  if (missing.length === 0) return null;
  return { month, missingDoctorIds: missing };
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

/** Слот/интервал полностью внутри смены врача (конец смены включительно как «до»). */
export function isIntervalWithinDoctorHours(
  doctorId: string,
  dateStr: string,
  startTime: string,
  endTime: string,
  schedules: DoctorMonthSchedule[]
): boolean {
  const hours = getDoctorHoursForDate(doctorId, dateStr, schedules);
  if (!hours) return false;
  const startMin = toMinutes(startTime);
  const endMin = toMinutes(endTime);
  if (endMin <= startMin) return false;
  return startMin >= toMinutes(hours.startTime) && endMin <= toMinutes(hours.endTime);
}

/** Стартовый слот сетки доступен, если 30‑мин интервал умещается в смену. */
export function isScheduleSlotWithinDoctorHours(
  doctorId: string,
  dateStr: string,
  slotStart: string,
  schedules: DoctorMonthSchedule[],
  slotMinutes = 30
): boolean {
  const endTime = addMinutesToTime(slotStart, slotMinutes);
  return isIntervalWithinDoctorHours(
    doctorId,
    dateStr,
    slotStart,
    endTime,
    schedules
  );
}

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

function addMinutesToTime(time: string, minutes: number): string {
  const total = toMinutes(time) + minutes;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function needsScheduleReminder(
  schedules: DoctorMonthSchedule[],
  doctorIds: string[],
  from = new Date()
): { month: string; missingDoctorIds: string[] } | null {
  if (doctorIds.length === 0) return null;
  if (!shouldPromptForNextMonthSchedule(from)) return null;

  const target = nextMonthKey(from);
  const missing = doctorIds.filter(
    (id) => !schedules.some((s) => s.doctorId === id && s.month === target)
  );
  if (missing.length === 0) return null;
  return { month: target, missingDoctorIds: missing };
}
