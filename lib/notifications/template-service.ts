import type {
  NotificationTemplate,
  NotificationTemplateContext,
} from "@/lib/notifications/types";

const VAR_PATTERN = /\{\{\s*([a-zA-Z]+)\s*\}\}/g;

export function renderNotificationTemplate(
  template: string,
  context: NotificationTemplateContext
): string {
  return template.replace(VAR_PATTERN, (_, key: string) => {
    const value = context[key as keyof NotificationTemplateContext];
    return value?.trim() ? value : "";
  });
}

export function findTemplateForChannel(
  templates: NotificationTemplate[],
  channel: string,
  eventType: NotificationTemplate["eventType"]
): NotificationTemplate | undefined {
  return (
    templates.find((t) => t.eventType === eventType && t.channel === channel) ??
    templates.find((t) => t.eventType === eventType && t.channel === "any") ??
    templates.find((t) => t.isDefault && t.channel === "any")
  );
}

export function validateTemplateVariables(body: string): string[] {
  const unknown: string[] = [];
  const allowed = new Set([
    "patientName",
    "appointmentDate",
    "appointmentTime",
    "doctorName",
    "cabinetName",
    "clinicName",
    "clinicPhone",
    "clinicAddress",
    "confirmUrl",
    "rescheduleUrl",
  ]);
  for (const match of body.matchAll(VAR_PATTERN)) {
    const key = match[1];
    if (key && !allowed.has(key)) unknown.push(key);
  }
  return unknown;
}

export function formatPatientDisplayName(parts: {
  firstName: string;
  lastName: string;
  middleName?: string;
}): string {
  return [parts.lastName, parts.firstName, parts.middleName].filter(Boolean).join(" ").trim();
}
