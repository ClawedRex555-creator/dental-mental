"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  detectBrowserPushCapability,
  subscribeDeviceToWebPush,
  type BrowserPushCapability,
} from "@/lib/notifications/web-push-client";
import { useClinicStore } from "@/store/useClinicStore";

/**
 * Баннер в дашборде: предлагает включить Web Push сотруднику
 * (врач / админ / владелец) без настройки SMS-каналов.
 */
export function WebPushEnabler() {
  const role = useClinicStore((s) => s.currentUser.role);
  const [capability] = useState<BrowserPushCapability>(() =>
    typeof window === "undefined" ? "unsupported" : detectBrowserPushCapability()
  );
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const staffRole = role === "owner" || role === "admin" || role === "doctor";

  useEffect(() => {
    if (!staffRole || typeof window === "undefined") return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/notifications/push/subscribe", {
          credentials: "same-origin",
        });
        if (!res.ok) {
          if (!cancelled) setSubscribed(null);
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (!cancelled) setSubscribed(Boolean(data.subscribed));
      } catch {
        if (!cancelled) setSubscribed(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [staffRole]);

  if (!staffRole || dismissed || subscribed !== false) return null;
  if (capability === "unsupported") return null;

  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-950">
      <p className="min-w-0 flex-1 text-xs sm:text-sm">
        {capability === "ios_home_screen_required"
          ? "Чтобы получать push на iPhone, добавьте сайт на экран «Домой» и откройте с иконки."
          : "Включите push-уведомления на этом устройстве — как в приложении, без SMS."}
      </p>
      <div className="flex shrink-0 items-center gap-2">
        {capability === "supported" && (
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => {
              void (async () => {
                setBusy(true);
                try {
                  const result = await subscribeDeviceToWebPush();
                  if (!result.ok) {
                    toast.error(result.error ?? "Не удалось включить push");
                    return;
                  }
                  setSubscribed(true);
                  toast.success("Push включены на этом устройстве");
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            {busy ? "Подключаем…" : "Включить push"}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setDismissed(true)}
        >
          Позже
        </Button>
      </div>
    </div>
  );
}
