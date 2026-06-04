/** Синхронизация смены dc_session между вкладками одного поддомена */

export const SESSION_SYNC_CHANNEL = "dc-session-sync";

export type SessionSyncReason = "login" | "logout";

export function notifySessionChanged(reason: SessionSyncReason): void {
  if (typeof window === "undefined") return;
  try {
    const channel = new BroadcastChannel(SESSION_SYNC_CHANNEL);
    channel.postMessage({ reason, at: Date.now() });
    channel.close();
  } catch {
    /* Safari private mode / старые браузеры */
  }
}

export function subscribeSessionChanged(
  handler: (reason: SessionSyncReason) => void
): () => void {
  if (typeof window === "undefined") return () => undefined;

  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(SESSION_SYNC_CHANNEL);
    channel.onmessage = (ev: MessageEvent<{ reason?: SessionSyncReason }>) => {
      const reason = ev.data?.reason;
      if (reason === "login" || reason === "logout") handler(reason);
    };
  } catch {
    return () => undefined;
  }

  return () => {
    channel?.close();
  };
}
