import "server-only";

import type {
  NotificationProvider,
  NotificationSendInput,
  NotificationSendResult,
} from "@/lib/notifications/providers/types";

/** Mock-провайдер для разработки и testMode */
export class MockNotificationProvider implements NotificationProvider {
  readonly channel = "mock";

  isConfigured(): boolean {
    return true;
  }

  async send(input: NotificationSendInput): Promise<NotificationSendResult> {
    const id = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (process.env.NOTIFICATIONS_MOCK_FAIL === "1" && !input.isTest) {
      return { ok: false, error: "Mock: симуляция ошибки отправки" };
    }
    return {
      ok: true,
      providerMessageId: id,
      delivered: true,
    };
  }
}
