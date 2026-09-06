import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  isValid,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";

export type SalaryPeriod = "day" | "week" | "month" | "custom";

function parseYmd(value?: string): Date | null {
  const raw = value?.trim();
  if (!raw) return null;
  // date input даёт yyyy-MM-dd — parseISO стабильнее, чем new Date(str)
  const d = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? parseISO(raw) : new Date(raw);
  return isValid(d) ? d : null;
}

export function getSalaryPeriodRange(
  period: SalaryPeriod,
  customFrom?: string,
  customTo?: string
): { from: Date; to: Date } {
  const now = new Date();
  if (period === "day") {
    return { from: startOfDay(now), to: endOfDay(now) };
  }
  if (period === "week") {
    return {
      from: startOfWeek(now, { weekStartsOn: 1 }),
      to: endOfWeek(now, { weekStartsOn: 1 }),
    };
  }
  if (period === "custom") {
    const from = parseYmd(customFrom);
    const to = parseYmd(customTo);
    if (from && to) {
      return { from: startOfDay(from), to: endOfDay(to) };
    }
    if (from) {
      return { from: startOfDay(from), to: endOfDay(from) };
    }
    if (to) {
      return { from: startOfDay(to), to: endOfDay(to) };
    }
    // Пока даты неполные — не падаем на Invalid Date, показываем текущий месяц
    return { from: startOfMonth(now), to: endOfMonth(now) };
  }
  return { from: startOfMonth(now), to: endOfMonth(now) };
}

export function isDateInRange(dateStr: string, from: Date, to: Date): boolean {
  const d = parseYmd(dateStr) ?? new Date(dateStr);
  if (!isValid(d) || !isValid(from) || !isValid(to)) return false;
  return d >= from && d <= to;
}
