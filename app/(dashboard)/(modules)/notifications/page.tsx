"use client";

import { NotificationsPanel } from "@/components/notifications/notifications-panel";

export default function NotificationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">Уведомления пациентов</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Напоминания о записи через Telegram, WhatsApp, SMS, e-mail и другие каналы
        </p>
      </div>
      <NotificationsPanel />
    </div>
  );
}
