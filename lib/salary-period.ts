import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";

export type SalaryPeriod = "day" | "week" | "month" | "custom";

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
  if (period === "custom" && customFrom && customTo) {
    return {
      from: new Date(customFrom),
      to: endOfDay(new Date(customTo)),
    };
  }
  return { from: startOfMonth(now), to: endOfMonth(now) };
}

export function isDateInRange(dateStr: string, from: Date, to: Date): boolean {
  const d = new Date(dateStr);
  return d >= from && d <= to;
}
