import "server-only";

import type {
  NotificationProvider,
  NotificationSendInput,
  NotificationSendResult,
} from "@/lib/notifications/providers/types";

/**
 * SMS-шлюз (абстракция). Пример: HTTP POST на URL провайдера.
 *
 * Env:
 * - NOTIFICATIONS_SMS_API_URL
 * - NOTIFICATIONS_SMS_API_KEY
 * - NOTIFICATIONS_SMS_SENDER (alfa-имя)
 */
export class SmsNotificationProvider implements NotificationProvider {
  readonly channel = "sms";

  isConfigured(): boolean {
    return Boolean(
      process.env.NOTIFICATIONS_SMS_API_URL?.trim() &&
        process.env.NOTIFICATIONS_SMS_API_KEY?.trim()
    );
  }

  async send(input: NotificationSendInput): Promise<NotificationSendResult> {
    const url = process.env.NOTIFICATIONS_SMS_API_URL?.trim();
    const key = process.env.NOTIFICATIONS_SMS_API_KEY?.trim();
    const sender = process.env.NOTIFICATIONS_SMS_SENDER?.trim() ?? "Emkaro";
    if (!url || !key) {
      return {
        ok: false,
        error: "SMS-шлюз не настроен (NOTIFICATIONS_SMS_API_URL, NOTIFICATIONS_SMS_API_KEY)",
      };
    }
    if (!input.toAddress?.trim()) {
      return { ok: false, error: "Нет номера телефона пациента" };
    }

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          to: input.toAddress.replace(/\D/g, ""),
          from: sender,
          text: input.body,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        id?: string;
        message_id?: string;
        error?: string;
      };
      if (!res.ok) {
        return { ok: false, error: json.error ?? `SMS HTTP ${res.status}` };
      }
      return {
        ok: true,
        providerMessageId: json.id ?? json.message_id,
        delivered: false,
      };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "SMS send failed",
      };
    }
  }
}
