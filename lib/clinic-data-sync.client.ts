/** Синхронизация clinic_snapshots между вкладками одного поддомена */

export const CLINIC_DATA_SYNC_CHANNEL = "dc-clinic-data-sync";

export type ClinicSyncCas = {
  updatedAt: string | null;
  revision: number | null;
};

/** Последний известный CAS — без лишнего GET ?meta=1 перед command API */
let cachedClinicCas: ClinicSyncCas = { updatedAt: null, revision: null };
let ackClinicServerVersionHandler:
  | ((updatedAt: string | null, revision: number | null) => void)
  | null = null;

export function getCachedClinicCas(): ClinicSyncCas {
  return cachedClinicCas;
}

export function setCachedClinicCas(
  updatedAt?: string | null,
  revision?: number | null
): void {
  if (updatedAt) cachedClinicCas = { ...cachedClinicCas, updatedAt };
  if (typeof revision === "number" && Number.isFinite(revision)) {
    cachedClinicCas = { ...cachedClinicCas, revision };
  }
}

export function registerAckClinicServerVersion(
  fn: ((updatedAt: string | null, revision: number | null) => void) | null
): void {
  ackClinicServerVersionHandler = fn;
}

/** Подтвердить версию сервера без полного GET snapshot (после command API). */
export function ackClinicServerVersion(
  updatedAt?: string | null,
  revision?: number | null
): void {
  setCachedClinicCas(updatedAt, revision);
  ackClinicServerVersionHandler?.(
    updatedAt ?? cachedClinicCas.updatedAt,
    typeof revision === "number" ? revision : cachedClinicCas.revision
  );
}

let markClinicSyncedAfterCommandHandler:
  | ((updatedAt: string | null, revision: number | null) => void)
  | null = null;

export function registerMarkClinicSyncedAfterCommand(
  fn: ((updatedAt: string | null, revision: number | null) => void) | null
): void {
  markClinicSyncedAfterCommandHandler = fn;
}

/**
 * После успешного command API: ack CAS + baseline = текущий store.
 * Иначе debounce PUT с autoMerge может откатить только что записанный статус.
 */
export function markClinicSyncedAfterCommand(
  updatedAt?: string | null,
  revision?: number | null
): void {
  setCachedClinicCas(updatedAt, revision);
  const at = updatedAt ?? cachedClinicCas.updatedAt;
  const rev = typeof revision === "number" ? revision : cachedClinicCas.revision;
  if (markClinicSyncedAfterCommandHandler) {
    markClinicSyncedAfterCommandHandler(at, rev);
    return;
  }
  ackClinicServerVersionHandler?.(at, rev);
}

/**
 * Открытые модалки (пациент, запись): пока редактируют — не применяем фоновый pull
 * (иначе store меняет doctors/cabinets и формы «обнуляются»).
 */
let clinicEditorSessionCount = 0;

export function beginClinicEditorSession(): void {
  clinicEditorSessionCount += 1;
}

export function endClinicEditorSession(): void {
  clinicEditorSessionCount = Math.max(0, clinicEditorSessionCount - 1);
}

export function isClinicEditorSessionOpen(): boolean {
  return clinicEditorSessionCount > 0;
}

let flushClinicDataSave: (() => void) | null = null;
let flushClinicDataSaveAsync:
  | ((options?: { keepalive?: boolean }) => Promise<void>)
  | null = null;
let pullClinicDataFromServer: ((options?: ClinicDataPullOptions) => void) | null = null;
let saveThenPullClinicData: (() => Promise<void>) | null = null;
let discardLocalEditsAndPullClinicData:
  | ((options?: ClinicDataPullOptions) => Promise<void>)
  | null = null;
let forcePullClinicDataFromServer:
  | ((options?: ClinicDataPullOptions) => Promise<void>)
  | null = null;

export type ClinicDataPullOptions = {
  force?: boolean;
  /** Только по явному действию пользователя — не перетирать локальные правки при фокусе вкладки */
  allowApplyDespitePending?: boolean;
  /** Обновить с сервера сразу после локального сохранения (иначе ждём cooldown) */
  allowDuringSaveCooldown?: boolean;
};

/** Регистрируется из ClinicDataSync — немедленный PUT после важных правок */
export function registerClinicDataFlush(fn: (() => void) | null): void {
  flushClinicDataSave = fn;
}

export function registerClinicDataFlushAsync(
  fn: ((options?: { keepalive?: boolean }) => Promise<void>) | null
): void {
  flushClinicDataSaveAsync = fn;
}

/** Регистрируется из ClinicDataSync — немедленный GET с сервера */
export function registerClinicDataPull(
  fn: ((options?: ClinicDataPullOptions) => void) | null
): void {
  pullClinicDataFromServer = fn;
}

export function registerSaveThenPullClinicData(fn: (() => Promise<void>) | null): void {
  saveThenPullClinicData = fn;
}

export function registerDiscardLocalEditsAndPull(
  fn: ((options?: ClinicDataPullOptions) => Promise<void>) | null
): void {
  discardLocalEditsAndPullClinicData = fn;
}

export function registerForcePullClinicDataFromServer(
  fn: ((options?: ClinicDataPullOptions) => Promise<void>) | null
): void {
  forcePullClinicDataFromServer = fn;
}

export function requestClinicDataFlush(): void {
  flushClinicDataSave?.();
}

export async function flushClinicDataBeforeSessionEnd(
  options?: { keepalive?: boolean }
): Promise<void> {
  await flushClinicDataSaveAsync?.(options);
}

export function requestClinicDataPull(options?: ClinicDataPullOptions): void {
  pullClinicDataFromServer?.(options);
}

export async function requestSaveThenPullClinicData(): Promise<void> {
  await saveThenPullClinicData?.();
}

export async function requestDiscardLocalEditsAndPull(
  options?: ClinicDataPullOptions
): Promise<void> {
  await discardLocalEditsAndPullClinicData?.(options);
}

/** Явное обновление с сервера: серверный снимок побеждает, локальные правки не блокируют pull */
export async function requestForcePullClinicDataFromServer(
  options?: ClinicDataPullOptions
): Promise<void> {
  await forcePullClinicDataFromServer?.(options);
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
