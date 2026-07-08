/** Типы модуля уведомлений пациентов */

export type NotificationChannel =
  | "mock"
  | "telegram"
  | "whatsapp"
  | "sms"
  | "email"
  | "vk"
  | "max";

export type NotificationDeliveryStatus =
  | "pending"
  | "sending"
  | "sent"
  | "delivered"
  | "failed"
  | "retry"
  | "cancelled";

export type NotificationEventType = "appointment_reminder" | "appointment_confirm";

/** Минуты до приёма: 1440=24ч, 720=12ч, 180=3ч, 60=1ч */
export type ReminderOffsetMinutes = number;

export interface NotificationSettings {
  enabled: boolean;
  enabledChannels: NotificationChannel[];
  reminderOffsetsMinutes: ReminderOffsetMinutes[];
  retryEnabled: boolean;
  retryCount: number;
  retryDelayMinutes: number;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  testMode: boolean;
  clinicName: string;
  clinicPhone: string;
  clinicAddress: string;
  /** Базовый URL клиники для ссылок подтверждения (https://slug.emkaro.ru) */
  publicBaseUrl?: string;
}

export interface NotificationTemplate {
  id: string;
  name: string;
  channel: NotificationChannel | "any";
  eventType: NotificationEventType;
  subject?: string;
  body: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationClinicConfig {
  settings: NotificationSettings;
  templates: NotificationTemplate[];
}

export interface NotificationDeliveryRow {
  id: string;
  clinicId: string;
  patientId: string;
  appointmentId: string;
  channel: NotificationChannel;
  eventType: NotificationEventType;
  reminderOffsetMinutes: number;
  status: NotificationDeliveryStatus;
  scheduledAt: string;
  sentAt?: string;
  deliveredAt?: string;
  errorMessage?: string;
  retryCount: number;
  providerMessageId?: string;
  messagePreview?: string;
  isTest: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationTemplateContext {
  patientName: string;
  appointmentDate: string;
  appointmentTime: string;
  doctorName: string;
  cabinetName: string;
  clinicName: string;
  clinicPhone: string;
  clinicAddress: string;
  confirmUrl?: string;
  rescheduleUrl?: string;
}

export const NOTIFICATION_TEMPLATE_VARIABLES: {
  key: keyof NotificationTemplateContext;
  label: string;
  example: string;
}[] = [
  { key: "patientName", label: "Имя пациента", example: "Иван Иванов" },
  { key: "appointmentDate", label: "Дата записи", example: "15.07.2026" },
  { key: "appointmentTime", label: "Время записи", example: "10:30" },
  { key: "doctorName", label: "Врач", example: "Петров П.П." },
  { key: "cabinetName", label: "Кабинет", example: "Кабинет 1" },
  { key: "clinicName", label: "Клиника", example: "Стоматология Улыбка" },
  { key: "clinicPhone", label: "Телефон клиники", example: "+7 (495) 000-00-00" },
  { key: "clinicAddress", label: "Адрес клиники", example: "ул. Примерная, 1" },
  { key: "confirmUrl", label: "Ссылка подтверждения", example: "https://…" },
  { key: "rescheduleUrl", label: "Ссылка переноса", example: "https://…" },
];

export const NOTIFICATION_CHANNEL_LABELS: Record<NotificationChannel, string> = {
  mock: "Тест (mock)",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  sms: "SMS",
  email: "E-mail",
  vk: "VK",
  max: "MAX",
};

export const NOTIFICATION_STATUS_LABELS: Record<NotificationDeliveryStatus, string> = {
  pending: "Ожидает отправки",
  sending: "Отправляется",
  sent: "Отправлено",
  delivered: "Доставлено",
  failed: "Ошибка",
  retry: "Повтор",
  cancelled: "Отменено",
};

export const DEFAULT_REMINDER_OFFSETS_MINUTES: ReminderOffsetMinutes[] = [
  1440, 720, 180, 60,
];
