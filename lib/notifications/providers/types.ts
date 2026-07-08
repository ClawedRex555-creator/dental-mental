export interface NotificationSendInput {
  clinicId: string;
  patientId: string;
  channel: string;
  toAddress: string;
  subject?: string;
  body: string;
  isTest?: boolean;
}

export interface NotificationSendResult {
  ok: boolean;
  providerMessageId?: string;
  delivered?: boolean;
  error?: string;
}

export interface NotificationProvider {
  readonly channel: string;
  isConfigured(): boolean;
  send(input: NotificationSendInput): Promise<NotificationSendResult>;
}
