import type {
  NotificationChannel,
  NotificationClinicConfig,
  NotificationSettings,
  NotificationTemplate,
} from "@/lib/notifications/types";
import { DEFAULT_REMINDER_OFFSETS_MINUTES } from "@/lib/notifications/types";

export const DEFAULT_NOTIFICATION_BODY =
  "Здравствуйте, {{patientName}}. Напоминаем, что вы записаны на приём {{appointmentDate}} в {{appointmentTime}}. Клиника: {{clinicName}}. Телефон: {{clinicPhone}}.";

export function defaultNotificationSettings(
  clinic?: { name?: string; phone?: string; address?: string }
): NotificationSettings {
  return {
    enabled: false,
    enabledChannels: ["mock"],
    reminderOffsetsMinutes: [...DEFAULT_REMINDER_OFFSETS_MINUTES],
    retryEnabled: true,
    retryCount: 3,
    retryDelayMinutes: 15,
    quietHoursEnabled: true,
    quietHoursStart: "22:00",
    quietHoursEnd: "08:00",
    testMode: true,
    clinicName: clinic?.name?.trim() || "",
    clinicPhone: clinic?.phone?.trim() || "",
    clinicAddress: clinic?.address?.trim() || "",
  };
}

export function defaultNotificationTemplates(now = new Date().toISOString()): NotificationTemplate[] {
  const base = {
    body: DEFAULT_NOTIFICATION_BODY,
    isDefault: true,
    createdAt: now,
    updatedAt: now,
  };
  return [
    {
      id: "tpl-reminder-any",
      name: "Напоминание о записи",
      channel: "any",
      eventType: "appointment_reminder",
      ...base,
    },
    {
      id: "tpl-reminder-email",
      name: "Напоминание (e-mail)",
      channel: "email",
      eventType: "appointment_reminder",
      subject: "Напоминание о записи — {{clinicName}}",
      ...base,
    },
  ];
}

export function defaultNotificationClinicConfig(
  clinic?: { name?: string; phone?: string; address?: string }
): NotificationClinicConfig {
  return {
    settings: defaultNotificationSettings(clinic),
    templates: defaultNotificationTemplates(),
  };
}

export function parseNotificationChannel(raw: unknown): NotificationChannel | null {
  const channels: NotificationChannel[] = [
    "mock",
    "telegram",
    "whatsapp",
    "sms",
    "email",
    "vk",
    "max",
  ];
  return typeof raw === "string" && channels.includes(raw as NotificationChannel)
    ? (raw as NotificationChannel)
    : null;
}

export function parseNotificationClinicConfig(raw: unknown): NotificationClinicConfig {
  const defaults = defaultNotificationClinicConfig();
  if (!raw || typeof raw !== "object") return defaults;
  const o = raw as Record<string, unknown>;
  const settingsRaw = o.settings;
  const templatesRaw = o.templates;

  const settings: NotificationSettings = { ...defaults.settings };
  if (settingsRaw && typeof settingsRaw === "object") {
    const s = settingsRaw as Record<string, unknown>;
    if (typeof s.enabled === "boolean") settings.enabled = s.enabled;
    if (Array.isArray(s.enabledChannels)) {
      settings.enabledChannels = s.enabledChannels
        .map(parseNotificationChannel)
        .filter((c): c is NotificationChannel => c !== null);
    }
    if (Array.isArray(s.reminderOffsetsMinutes)) {
      settings.reminderOffsetsMinutes = s.reminderOffsetsMinutes
        .map((x) => Number(x))
        .filter((n) => Number.isFinite(n) && n > 0);
    }
    if (typeof s.retryEnabled === "boolean") settings.retryEnabled = s.retryEnabled;
    if (typeof s.retryCount === "number") settings.retryCount = Math.max(0, Math.min(10, s.retryCount));
    if (typeof s.retryDelayMinutes === "number") {
      settings.retryDelayMinutes = Math.max(1, Math.min(1440, s.retryDelayMinutes));
    }
    if (typeof s.quietHoursEnabled === "boolean") settings.quietHoursEnabled = s.quietHoursEnabled;
    if (typeof s.quietHoursStart === "string") settings.quietHoursStart = s.quietHoursStart;
    if (typeof s.quietHoursEnd === "string") settings.quietHoursEnd = s.quietHoursEnd;
    if (typeof s.testMode === "boolean") settings.testMode = s.testMode;
    if (typeof s.clinicName === "string") settings.clinicName = s.clinicName;
    if (typeof s.clinicPhone === "string") settings.clinicPhone = s.clinicPhone;
    if (typeof s.clinicAddress === "string") settings.clinicAddress = s.clinicAddress;
    if (typeof s.publicBaseUrl === "string") settings.publicBaseUrl = s.publicBaseUrl.trim();
  }

  let templates = defaults.templates;
  if (Array.isArray(templatesRaw) && templatesRaw.length > 0) {
    templates = templatesRaw
      .map((t) => parseNotificationTemplate(t))
      .filter((t): t is NotificationTemplate => t !== null);
  }

  if (settings.enabledChannels.length === 0) {
    settings.enabledChannels = ["mock"];
  }
  if (settings.reminderOffsetsMinutes.length === 0) {
    settings.reminderOffsetsMinutes = [...DEFAULT_REMINDER_OFFSETS_MINUTES];
  }

  return { settings, templates };
}

export function parseNotificationTemplate(raw: unknown): NotificationTemplate | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  if (typeof t.id !== "string" || typeof t.name !== "string" || typeof t.body !== "string") {
    return null;
  }
  const channel =
    t.channel === "any" ? "any" : parseNotificationChannel(t.channel) ?? "any";
  const eventType =
    t.eventType === "appointment_confirm" ? "appointment_confirm" : "appointment_reminder";
  return {
    id: t.id,
    name: t.name,
    channel,
    eventType,
    subject: typeof t.subject === "string" ? t.subject : undefined,
    body: t.body,
    isDefault: t.isDefault === true,
    createdAt: typeof t.createdAt === "string" ? t.createdAt : new Date().toISOString(),
    updatedAt: typeof t.updatedAt === "string" ? t.updatedAt : new Date().toISOString(),
  };
}
