import "server-only";

import type {
  NotificationProvider,
  NotificationSendInput,
  NotificationSendResult,
} from "@/lib/notifications/providers/types";

/**
 * E-mail через SMTP-подобный HTTP relay или внешний API.
 *
 * Env:
 * - NOTIFICATIONS_SMTP_URL (HTTP endpoint relay, optional)
 * - NOTIFICATIONS_SMTP_API_KEY
 * - NOTIFICATIONS_EMAIL_FROM
 *
 * TODO: нативный nodemailer при появлении SMTP_HOST/PORT/USER/PASS
 */
export class EmailNotificationProvider implements NotificationProvider {
  readonly channel = "email";

  isConfigured(): boolean {
    return Boolean(
      process.env.NOTIFICATIONS_SMTP_URL?.trim() &&
        process.env.NOTIFICATIONS_EMAIL_FROM?.trim()
    );
  }

  async send(input: NotificationSendInput): Promise<NotificationSendResult> {
    const url = process.env.NOTIFICATIONS_SMTP_URL?.trim();
    const from = process.env.NOTIFICATIONS_EMAIL_FROM?.trim();
    const key = process.env.NOTIFICATIONS_SMTP_API_KEY?.trim();
    if (!url || !from) {
      return {
        ok: false,
        error: "E-mail не настроен (NOTIFICATIONS_SMTP_URL, NOTIFICATIONS_EMAIL_FROM)",
      };
    }
    if (!input.toAddress?.trim()) {
      return { ok: false, error: "Нет e-mail пациента" };
    }

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(key ? { Authorization: `Bearer ${key}` } : {}),
        },
        body: JSON.stringify({
          from,
          to: input.toAddress,
          subject: input.subject ?? "Напоминание о записи",
          text: input.body,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return { ok: false, error: text.slice(0, 200) || `Email HTTP ${res.status}` };
      }
      return { ok: true, delivered: false };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Email send failed",
      };
    }
  }
}

/** VK / MAX — заглушки под будущие адаптеры */
export class VkNotificationProvider implements NotificationProvider {
  readonly channel = "vk";
  isConfigured(): boolean {
    return Boolean(process.env.NOTIFICATIONS_VK_ACCESS_TOKEN?.trim());
  }
  async send(): Promise<NotificationSendResult> {
    return {
      ok: false,
      error: "VK-адаптер: задайте NOTIFICATIONS_VK_ACCESS_TOKEN и реализуйте API VK",
    };
  }
}

export class MaxNotificationProvider implements NotificationProvider {
  readonly channel = "max";
  isConfigured(): boolean {
    return Boolean(process.env.NOTIFICATIONS_MAX_API_TOKEN?.trim());
  }
  async send(): Promise<NotificationSendResult> {
    return {
      ok: false,
      error: "MAX-адаптер: задайте NOTIFICATIONS_MAX_API_TOKEN",
    };
  }
}
