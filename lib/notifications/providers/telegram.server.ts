import "server-only";

import type {
  NotificationProvider,
  NotificationSendInput,
  NotificationSendResult,
} from "@/lib/notifications/providers/types";

/**
 * Telegram Bot API — https://core.telegram.org/bots/api
 * TODO: пациент должен начать диалог с ботом; chat_id хранится в patient.notificationPrefs.telegramChatId
 * Env: NOTIFICATIONS_TELEGRAM_BOT_TOKEN
 */
export class TelegramNotificationProvider implements NotificationProvider {
  readonly channel = "telegram";

  isConfigured(): boolean {
    return Boolean(process.env.NOTIFICATIONS_TELEGRAM_BOT_TOKEN?.trim());
  }

  async send(input: NotificationSendInput): Promise<NotificationSendResult> {
    const token = process.env.NOTIFICATIONS_TELEGRAM_BOT_TOKEN?.trim();
    if (!token) {
      return {
        ok: false,
        error: "NOTIFICATIONS_TELEGRAM_BOT_TOKEN не задан на сервере",
      };
    }
    if (!input.toAddress?.trim()) {
      return { ok: false, error: "У пациента не привязан Telegram (chat_id)" };
    }

    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: input.toAddress,
          text: input.body,
          disable_web_page_preview: true,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; result?: { message_id?: number }; description?: string };
      if (!json.ok) {
        return { ok: false, error: json.description ?? "Telegram API error" };
      }
      return {
        ok: true,
        providerMessageId: String(json.result?.message_id ?? ""),
        delivered: true,
      };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Telegram send failed",
      };
    }
  }
}
