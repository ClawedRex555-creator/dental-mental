export type NotificationAction = "confirm";

export interface NotificationActionTokenPayload {
  clinicId: string;
  appointmentId: string;
  patientId: string;
  action: NotificationAction;
  exp: number;
}
