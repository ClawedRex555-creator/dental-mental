import "server-only";

import type {
  NotificationProvider,
  NotificationSendInput,
  NotificationSendResult,
} from "@/lib/notifications/providers/types";

/**
 * WhatsApp Business API (Meta Cloud API или провайдер вроде Twilio/MessageBird).
 * Не используем неофициальные клиенты.
 *
 * Env (пример Meta Cloud API):
 * - NOTIFICATIONS_WHATSAPP_ACCESS_TOKEN
 * - NOTIFICATIONS_WHATSAPP_PHONE_NUMBER_ID
 * - NOTIFICATIONS_WHATSAPP_API_URL (optional, default graph.facebook.com v21)
 */
export class WhatsAppNotificationProvider implements NotificationProvider {
  readonly channel = "whatsapp";

  isConfigured(): boolean {
    return Boolean(
      process.env.NOTIFICATIONS_WHATSAPP_ACCESS_TOKEN?.trim() &&
        process.env.NOTIFICATIONS_WHATSAPP_PHONE_NUMBER_ID?.trim()
    );
  }

  async send(input: NotificationSendInput): Promise<NotificationSendResult> {
    const token = process.env.NOTIFICATIONS_WHATSAPP_ACCESS_TOKEN?.trim();
    const phoneId = process.env.NOTIFICATIONS_WHATSAPP_PHONE_NUMBER_ID?.trim();
    if (!token || !phoneId) {
      return {
        ok: false,
        error:
          "WhatsApp Business API не настроен (NOTIFICATIONS_WHATSAPP_ACCESS_TOKEN, NOTIFICATIONS_WHATSAPP_PHONE_NUMBER_ID)",
      };
    }
    if (!input.toAddress?.trim()) {
      return { ok: false, error: "Нет номера телефона пациента для WhatsApp" };
    }

    const apiBase =
      process.env.NOTIFICATIONS_WHATSAPP_API_URL?.trim() ||
      "https://graph.facebook.com/v21.0";
    const to = input.toAddress.replace(/\D/g, "");

    try {
      const res = await fetch(`${apiBase}/${phoneId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: input.body },
        }),
      });
      const json = (await res.json()) as {
        messages?: { id?: string }[];
        error?: { message?: string };
      };
      if (!res.ok) {
        return { ok: false, error: json.error?.message ?? `HTTP ${res.status}` };
      }
      return {
        ok: true,
        providerMessageId: json.messages?.[0]?.id,
        delivered: false,
      };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "WhatsApp send failed",
      };
    }
  }
}
