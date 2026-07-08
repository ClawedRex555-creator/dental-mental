/** Клиентские константы (без server-only) */

export const DEFAULT_NOTIFICATION_BODY =
  "Здравствуйте, {{patientName}}. Напоминаем, что вы записаны на приём {{appointmentDate}} в {{appointmentTime}}. Клиника: {{clinicName}}. Телефон: {{clinicPhone}}.";

export const DEFAULT_REMINDER_PRESETS = [
  { minutes: 1440, label: "За 24 часа" },
  { minutes: 720, label: "За 12 часов" },
  { minutes: 180, label: "За 3 часа" },
  { minutes: 60, label: "За 1 час" },
] as const;
