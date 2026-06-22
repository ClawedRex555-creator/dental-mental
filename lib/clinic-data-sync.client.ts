/** Синхронизация clinic_snapshots между вкладками одного поддомена */

export const CLINIC_DATA_SYNC_CHANNEL = "dc-clinic-data-sync";

let flushClinicDataSave: (() => void) | null = null;

/** Регистрируется из ClinicDataSync — немедленный PUT после важных правок */
export function registerClinicDataFlush(fn: (() => void) | null): void {
  flushClinicDataSave = fn;
}

export function requestClinicDataFlush(): void {
  flushClinicDataSave?.();
}

export function notifyClinicDataChanged(): void {
  if (typeof window === "undefined") return;
  try {
    const channel = new BroadcastChannel(CLINIC_DATA_SYNC_CHANNEL);
    channel.postMessage({ at: Date.now() });
    channel.close();
  } catch {
    /* Safari private mode / старые браузеры */
  }
}

export function subscribeClinicDataChanged(handler: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;

  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(CLINIC_DATA_SYNC_CHANNEL);
    channel.onmessage = () => handler();
  } catch {
    return () => undefined;
  }

  return () => {
    channel?.close();
  };
}
