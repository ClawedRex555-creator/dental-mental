export type ClinicSmsTaskStatus =
  | "CREATED"
  | "WAITING_FOR_DEVICE"
  | "PRESENTED_TO_DEVICE"
  | "SMS_COMPOSER_OPENED"
  | "MANUAL_SEND_CONFIRMED"
  | "CANCELLED"
  | "EXPIRED"
  | "FAILED";

export type ClinicSenderDeviceStatus = "active" | "revoked" | "expired";

export interface ClinicSignSenderDevice {
  id: string;
  clinicId: string;
  displayName: string;
  declaredPhoneNumber?: string;
  deviceName?: string;
  platform?: string;
  pairedAt: string;
  pairedByUserId?: string;
  lastSeenAt?: string;
  status: ClinicSenderDeviceStatus;
  isPrimary: boolean;
}

export interface ClinicSmsSendTask {
  id: string;
  clinicId: string;
  packageId: string;
  signRequestId?: string;
  patientId: string;
  patientDisplayName: string;
  recipientPhone: string;
  recipientPhoneMasked: string;
  smsText: string;
  publicSignUrl: string;
  documentTitles: string[];
  deviceId?: string;
  createdByUserId?: string;
  createdAt: string;
  expiresAt: string;
  status: ClinicSmsTaskStatus;
  presentedAt?: string;
  composerOpenedAt?: string;
  manualSendConfirmedAt?: string;
  manualSendConfirmedBy?: string;
  idempotencyKey?: string;
}

/** Safe view for device UI — no medical details. */
export interface ClinicSmsTaskDeviceView {
  id: string;
  patientDisplayName: string;
  recipientPhoneMasked: string;
  documentCount: number;
  status: ClinicSmsTaskStatus;
  expiresAt: string;
  createdAt: string;
}

export const CLINIC_SMS_TASK_STATUS_LABELS: Record<ClinicSmsTaskStatus, string> = {
  CREATED: "Пакет создан",
  WAITING_FOR_DEVICE: "Ожидает телефон клиники",
  PRESENTED_TO_DEVICE: "Передано на телефон клиники",
  SMS_COMPOSER_OPENED: "Открыт редактор SMS",
  MANUAL_SEND_CONFIRMED: "Сотрудник подтвердил отправку SMS",
  CANCELLED: "Отменено",
  EXPIRED: "Истекло",
  FAILED: "Ошибка",
};
