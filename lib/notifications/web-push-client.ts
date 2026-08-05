/** Клиентские хелперы Web Push (без server-only). */

export type BrowserPushCapability = "supported" | "ios_home_screen_required" | "unsupported";

export function detectIosBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const iosByUa = /iPad|iPhone|iPod/i.test(ua);
  const iosIpadDesktopMode =
    navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return iosByUa || iosIpadDesktopMode;
}

export function isStandaloneWebApp(): boolean {
  if (typeof window === "undefined") return false;
  const iosNavigator = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
    iosNavigator.standalone === true
  );
}

export function detectBrowserPushCapability(): BrowserPushCapability {
  if (typeof window === "undefined") return "unsupported";
  const ios = detectIosBrowser();
  if (ios && !isStandaloneWebApp()) return "ios_home_screen_required";
  if (
    !window.isSecureContext ||
    !("Notification" in window) ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    return "unsupported";
  }
  return "supported";
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function registerPushServiceWorker(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export async function subscribeDeviceToWebPush(): Promise<{
  ok: boolean;
  error?: string;
  permission?: NotificationPermission;
}> {
  const capability = detectBrowserPushCapability();
  if (capability === "ios_home_screen_required") {
    return {
      ok: false,
      error:
        "На iPhone push работает только из ярлыка «На экран Домой» (Safari → Поделиться → На экран Домой).",
    };
  }
  if (capability !== "supported") {
    return {
      ok: false,
      error: "Push недоступен: нужен HTTPS и поддерживаемый браузер.",
    };
  }

  const currentPermission =
    typeof Notification !== "undefined" ? Notification.permission : "default";

  // Если уже denied — браузер больше не покажет системный диалог,
  // requestPermission() сразу вернёт denied.
  if (currentPermission === "denied") {
    return {
      ok: false,
      permission: "denied",
      error:
        "Уведомления для этого сайта уже запрещены в браузере. Android / Яндекс: откройте сайт в браузере → значок замка или «i» у адреса → Уведомления → Разрешить. Или: Настройки Android → Приложения → Яндекс → Уведомления — включите, затем снова нажмите «Включить push».",
    };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return {
      ok: false,
      permission,
      error:
        permission === "denied"
          ? "Вы отклонили запрос. Разрешите уведомления для сайта в настройках Яндекса/браузера и нажмите «Включить push» ещё раз."
          : "Запрос разрешения закрыт без выбора. Нажмите «Включить push» ещё раз и выберите «Разрешить».",
    };
  }

  const vapidRes = await fetch("/api/notifications/push/vapid", {
    credentials: "same-origin",
  });
  const vapidData = await vapidRes.json().catch(() => ({}));
  if (!vapidRes.ok || !vapidData.publicKey) {
    return {
      ok: false,
      permission,
      error: vapidData.error ?? "Не удалось получить ключ push с сервера",
    };
  }

  const registration = await registerPushServiceWorker();
  await navigator.serviceWorker.ready;

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidData.publicKey) as BufferSource,
    }));

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { ok: false, permission, error: "Браузер не вернул данные подписки" };
  }

  const saveRes = await fetch("/api/notifications/push/subscribe", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      userAgent: navigator.userAgent,
    }),
  });
  const saveData = await saveRes.json().catch(() => ({}));
  if (!saveRes.ok) {
    return {
      ok: false,
      permission,
      error: saveData.error ?? "Не удалось сохранить подписку на сервере",
    };
  }

  return { ok: true, permission };
}

export async function unsubscribeDeviceFromWebPush(): Promise<{ ok: boolean; error?: string }> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, error: "Push не поддерживается" };
  }

  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  const endpoint = subscription?.endpoint;

  if (subscription) {
    await subscription.unsubscribe().catch(() => undefined);
  }

  const res = await fetch("/api/notifications/push/subscribe", {
    method: "DELETE",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(endpoint ? { endpoint } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: data.error ?? "Не удалось отключить push" };
  }
  return { ok: true };
}
