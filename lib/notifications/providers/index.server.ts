import "server-only";

import type { NotificationChannel } from "@/lib/notifications/types";
import { EmailNotificationProvider, MaxNotificationProvider, VkNotificationProvider } from "@/lib/notifications/providers/email.server";
import { MockNotificationProvider } from "@/lib/notifications/providers/mock.server";
import { SmsNotificationProvider } from "@/lib/notifications/providers/sms.server";
import { TelegramNotificationProvider } from "@/lib/notifications/providers/telegram.server";
import type { NotificationProvider } from "@/lib/notifications/providers/types";
import { WhatsAppNotificationProvider } from "@/lib/notifications/providers/whatsapp.server";

const providers: NotificationProvider[] = [
  new MockNotificationProvider(),
  new TelegramNotificationProvider(),
  new WhatsAppNotificationProvider(),
  new SmsNotificationProvider(),
  new EmailNotificationProvider(),
  new VkNotificationProvider(),
  new MaxNotificationProvider(),
];

const byChannel = new Map(providers.map((p) => [p.channel, p]));

export function getNotificationProvider(channel: NotificationChannel): NotificationProvider | undefined {
  return byChannel.get(channel);
}

export function listNotificationProviderStatus(): Record<
  NotificationChannel,
  { configured: boolean }
> {
  const channels: NotificationChannel[] = [
    "mock",
    "telegram",
    "whatsapp",
    "sms",
    "email",
    "vk",
    "max",
  ];
  const out = {} as Record<NotificationChannel, { configured: boolean }>;
  for (const ch of channels) {
    out[ch] = { configured: byChannel.get(ch)?.isConfigured() ?? false };
  }
  return out;
}

export function resolveActiveProvider(
  channel: NotificationChannel,
  testMode: boolean
): NotificationProvider {
  if (testMode || channel === "mock") {
    return byChannel.get("mock")!;
  }
  const provider = byChannel.get(channel);
  if (!provider) {
    return byChannel.get("mock")!;
  }
  if (!provider.isConfigured()) {
    return byChannel.get("mock")!;
  }
  return provider;
}
