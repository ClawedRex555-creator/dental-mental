export interface DurationOption {
  value: number;
  label: string;
}

function hourLabel(hours: number): string {
  const n = hours % 100;
  const n1 = n % 10;
  if (n1 === 1 && n !== 11) return `${hours} час`;
  if (n1 >= 2 && n1 <= 4 && (n < 10 || n >= 20)) return `${hours} часа`;
  return `${hours} часов`;
}

export function formatDurationLabel(totalMinutes: number): string {
  if (totalMinutes < 60) return `${totalMinutes} мин`;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const h = hourLabel(hours);
  if (mins === 0) return h;
  return `${h} ${mins} минут`;
}

/** 15, 30, 45 мин, затем от 1 ч до 5 ч с шагом 15 мин */
export function buildAppointmentDurationOptions(): DurationOption[] {
  const options: DurationOption[] = [
    { value: 15, label: "15 мин" },
    { value: 30, label: "30 мин" },
    { value: 45, label: "45 мин" },
  ];
  for (let minutes = 60; minutes <= 300; minutes += 15) {
    options.push({ value: minutes, label: formatDurationLabel(minutes) });
  }
  return options;
}

export const APPOINTMENT_DURATION_OPTIONS = buildAppointmentDurationOptions();
