import type { Appointment } from "./types";

/** assistantId → yyyy-MM-dd → часы (смена без приёма или доп. часы) */
export type AssistantManualHoursMap = Record<string, Record<string, string>>;

function isDateInRange(dateStr: string, from: Date, to: Date): boolean {
  const d = new Date(dateStr);
  return d >= from && d <= to;
}

export function normalizeAssistantManualHours(raw: unknown): AssistantManualHoursMap {
  if (!raw || typeof raw !== "object") return {};
  const out: AssistantManualHoursMap = {};
  for (const [assistantId, val] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof val === "string") continue;
    if (!val || typeof val !== "object" || Array.isArray(val)) continue;
    const days: Record<string, string> = {};
    for (const [date, hours] of Object.entries(val as Record<string, unknown>)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || typeof hours !== "string") continue;
      if (!hours.trim()) continue;
      days[date] = hours;
    }
    if (Object.keys(days).length > 0) out[assistantId] = days;
  }
  return out;
}

export function mergeAssistantManualHours(
  a: AssistantManualHoursMap,
  b: AssistantManualHoursMap
): AssistantManualHoursMap {
  const out = normalizeAssistantManualHours(a);
  for (const [assistantId, days] of Object.entries(normalizeAssistantManualHours(b))) {
    out[assistantId] = { ...(out[assistantId] ?? {}), ...days };
  }
  return out;
}

export function sumManualAssistantHoursInRange(
  assistantId: string,
  manual: AssistantManualHoursMap,
  from: Date,
  to: Date
): number {
  const byDay = manual[assistantId];
  if (!byDay) return 0;
  let sum = 0;
  for (const [date, hoursStr] of Object.entries(byDay)) {
    if (!isDateInRange(date, from, to)) continue;
    const hours = Number(hoursStr.replace(",", "."));
    if (Number.isFinite(hours) && hours > 0) sum += hours;
  }
  return sum;
}

export function calcAssistantHoursInRange(
  assistantId: string,
  appointments: Appointment[],
  from: Date,
  to: Date,
  manual: AssistantManualHoursMap
): number {
  const appointmentHours = appointments
    .filter((a) => a.assistantId === assistantId && isDateInRange(a.date, from, to))
    .reduce((s, a) => s + (a.assistantHours ?? 0), 0);
  return appointmentHours + sumManualAssistantHoursInRange(assistantId, manual, from, to);
}
