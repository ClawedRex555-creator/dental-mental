"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  fetchClinicDataFromServer,
  fetchClinicDataMetaFromServer,
  saveClinicDataToServer,
} from "@/lib/clinic-data-client";
import {
  isClinicServerDatabaseMode,
  setClinicServerDatabaseMode,
} from "@/lib/clinic-client-mode";
import {
  canReadClinicDataSync,
  canWriteClinicDataSync,
} from "@/lib/clinic-data-access";
import { FetchTimeoutError } from "@/lib/fetch-with-timeout";
import {
  createFreshPersistedState,
  hasClinicData,
  parseClinicPersistedState,
  pickPersistedState,
  snapshotHasLocalOnlyEntities,
  type ClinicPersistedState,
} from "@/lib/clinic-persisted-state";
import {
  isClinicEditorSessionOpen,
  notifyClinicDataChanged,
  registerAckClinicServerVersion,
  registerClinicDataFlush,
  registerClinicDataFlushAsync,
  registerClinicDataPull,
  registerDiscardLocalEditsAndPull,
  registerForcePullClinicDataFromServer,
  registerMarkClinicSyncedAfterCommand,
  registerSaveThenPullClinicData,
  setCachedClinicCas,
  subscribeClinicDataChanged,
} from "@/lib/clinic-data-sync.client";
import {
  mergeRemoteSnapshotForPull,
  prepareSnapshotAfterServerFetch,
  serverSnapshotHasIncomingUpdates,
  shouldPushSnapshotAfterServerFetch,
} from "@/lib/clinic-snapshot-load";
import {
  clearPendingClinicSnapshot,
  clearOversizedPendingBuffers,
  discardStalePendingClinicSnapshot,
  hasPendingClinicRecoveryData,
  mergePendingIntoClinicSnapshot,
  PENDING_BUFFER_ERROR,
  readPendingClinicSnapshot,
  slimSnapshotForPendingBuffer,
  writePendingClinicSnapshot,
} from "@/lib/clinic-pending-sync";
import { resolveClinicBootstrap } from "@/lib/clinic-bootstrap.client";
import { CLINIC_SAVE_RETRY_DELAYS_MS, sleep } from "@/lib/clinic-save-retry";
import { clinicSaveErrorMessage } from "@/lib/clinic-save-feedback";
import { CLINIC_STORAGE_KEY } from "@/lib/initial-clinic-data";
import { ensureClinicStorageScope } from "@/lib/clinic-storage-scope";
import {
  isClinicCommandOptimisticUpdate,
  onClinicCommandMutationEnded,
  useClinicStore,
} from "@/store/useClinicStore";

const SAVE_DEBOUNCE_MS = 400;
const PERIODIC_FLUSH_MS = 60_000;
/** После успешного PUT не подтягивать сервер автоматически — VPN/медленная сеть */
const SAVE_ACK_PULL_COOLDOWN_MS = 6_000;
const AUTO_SAVE_THEN_PULL_COOLDOWN_MS = 12_000;
const VERIFY_SAVE_ACK_RETRY_DELAYS_MS = [0, 250, 750, 1500] as const;
/** Лёгкий опрос meta (только updatedAt) — полный snapshot только при изменениях */
const PERIODIC_PULL_MS = 8_000;
/** При простое вкладки реже дергаем meta (M3). */
const PERIODIC_PULL_IDLE_MS = 30_000;
const IDLE_AFTER_MS = 60_000;

function syncErrorMessage(error: unknown): string {
  if (error instanceof FetchTimeoutError) return error.message;
  if (error instanceof Error) return error.message;
  return "Не удалось связаться с сервером";
}

function scheduleIdleWork(work: () => void): void {
  if (typeof requestIdleCallback !== "undefined") {
    requestIdleCallback(work, { timeout: 2500 });
  } else {
    setTimeout(work, 0);
  }
}

/** Загрузка данных клиники с сервера и автосохранение */
export function ClinicDataSync() {
  const syncReady = useRef(false);
  const initialLoadDone = useRef(false);
  const syncForbidden = useRef(false);
  const canWrite = useRef(false);
  const saving = useRef(false);
  const pulling = useRef(false);
  /** replacePersistedState синхронно дергает subscribe — не считать это правкой пользователя */
  const suppressPersistedChange = useRef(false);
  const lastSavedJson = useRef("");
  const lastServerUpdatedAt = useRef<string | null>(null);
  const lastServerRevision = useRef<number | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const periodicTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pullTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastUserActivityAt = useRef(0);
  const pullAfterCooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedStatusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushAfterBaseline = useRef(false);
  const autoResolveServerNewerRunning = useRef(false);
  const lastAutoResolveServerNewerAt = useRef(0);
  const pendingFlushAfterSave = useRef(false);
  const pendingPullAfterSave = useRef(false);
  const pendingPullAfterPull = useRef(false);
  const saveAckCooldownUntil = useRef(0);
  /** Снимок для подписки — без clinicDataUnsaved, иначе бесконечный subscribe */
  const lastTrackedSnap = useRef("");
  const staleSignalCount = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const { setClinicSyncPhase, setClinicDataUnsaved, setClinicSaveStatus, setClinicDataSaveError, setClinicServerNewerAvailable } =
      useClinicStore.getState();

    setClinicSyncPhase("loading");
    setClinicDataSaveError(null);

    const finishPhase = (phase: ReturnType<typeof useClinicStore.getState>["clinicSyncPhase"]) => {
      if (!cancelled) setClinicSyncPhase(phase);
    };

    /** Fingerprint без тяжёлых dataUrl — единый для lastTrackedSnap */
    const snapFingerprint = (snapshot: ClinicPersistedState): string =>
      JSON.stringify(slimSnapshotForPendingBuffer(snapshot));

    /** Если GET/парсинг зависли — не держим UI в «Загрузка…» бесконечно */
    const loadingWatchdog = window.setTimeout(() => {
      if (cancelled) return;
      if (useClinicStore.getState().clinicSyncPhase !== "loading") return;
      syncReady.current = false;
      finishPhase("error");
      setClinicDataSaveError(
        "Загрузка данных клиники занимает слишком много времени. Обновите страницу (F5) или очистите данные сайта для этого поддомена."
      );
    }, 60_000);

    /** Есть ли правки пользователя, ещё не подтверждённые успешным PUT */
    const hasUnsavedUserEdits = () => {
      if (saveTimer.current) return true;
      const storeNow = useClinicStore.getState();
      const json = JSON.stringify(pickPersistedState(storeNow));
      if (json !== lastSavedJson.current) {
        // Для read-only вкладок "самопочинка" снимка не должна блокировать pull бесконечно.
        if (!canWrite.current) {
          lastSavedJson.current = json;
          return false;
        }
        return true;
      }
      if (!lastSavedJson.current) return hasPendingClinicRecoveryData();
      const pending = readPendingClinicSnapshot();
      if (!pending) return false;
      return JSON.stringify(pending) !== lastSavedJson.current;
    };

    /** Очередь локальных правок, которые нужно сначала отправить */
    const hasLocalSyncQueue = () => {
      if (hasUnsavedUserEdits() || hasPendingClinicRecoveryData()) return true;
      const status = useClinicStore.getState().clinicSaveStatus;
      if (status === "pending" || status === "saving" || status === "failed") return true;
      return Boolean(useClinicStore.getState().clinicDataUnsaved);
    };

    /** Любые локальные данные, которые опасны потерять при «обновить с сервера» */
    const hasProtectableLocalData = (remote?: ClinicPersistedState | null) => {
      // Открытая форма нового пациента/записи — не трогаем store фоновым pull
      if (isClinicEditorSessionOpen()) return true;
      if (hasLocalSyncQueue()) return true;
      if (!remote) return false;
      const local = mergePendingIntoClinicSnapshot(
        pickPersistedState(useClinicStore.getState())
      );
      return snapshotHasLocalOnlyEntities(local, remote);
    };

    /** Автоперезагрузка теряет открытые формы (новый пациент, запись). Только плашка. */
    const maybeAutoReloadStaleTab = (_reason: string): boolean => {
      return false;
    };

    const lastSyncedBaseline = (): ClinicPersistedState => {
      if (!lastSavedJson.current) {
        return pickPersistedState(useClinicStore.getState());
      }
      try {
        const parsed = parseClinicPersistedState(JSON.parse(lastSavedJson.current));
        if (parsed) return parsed;
      } catch {
        /* fall through */
      }
      return pickPersistedState(useClinicStore.getState());
    };

    const ackServerSnapshotVersion = (
      updatedAt?: string | null,
      revision?: number | null
    ) => {
      if (updatedAt) lastServerUpdatedAt.current = updatedAt;
      if (typeof revision === "number" && Number.isFinite(revision)) {
        lastServerRevision.current = revision;
      }
      setCachedClinicCas(updatedAt, revision);
      staleSignalCount.current = 0;
      setClinicServerNewerAvailable(false);
    };

    const applyRemoteSnapshot = (
      remote: ClinicPersistedState,
      updatedAt?: string | null,
      options?: { preferServer?: boolean; revision?: number | null }
    ) => {
      const local = mergePendingIntoClinicSnapshot(pickPersistedState(useClinicStore.getState()));
      // Никогда не затираем локальных пациентов/записи: даже «Обновить с сервера»
      // должно смержить сущности, которых ещё нет на сервере.
      // preferServer=true (command API force-pull): сервер побеждает, иначе
      // открытая модалка оставляла старый status в store.
      const hasLocalOnly = snapshotHasLocalOnlyEntities(local, remote);
      const hasLocalToProtect =
        !options?.preferServer &&
        (isClinicEditorSessionOpen() ||
          hasUnsavedUserEdits() ||
          hasPendingClinicRecoveryData() ||
          hasLocalOnly);
      const forceRemoteOnly = Boolean(options?.preferServer) || !hasLocalToProtect;
      const snapshot = mergeRemoteSnapshotForPull(remote, local, !forceRemoteOnly);
      let json: string;
      try {
        json = JSON.stringify(snapshot);
      } catch {
        ackServerSnapshotVersion(updatedAt, options?.revision);
        return;
      }
      if (json === lastSavedJson.current) {
        ackServerSnapshotVersion(updatedAt, options?.revision);
        return;
      }
      suppressPersistedChange.current = true;
      try {
        lastTrackedSnap.current = snapFingerprint(snapshot);
        if (forceRemoteOnly) {
          lastSavedJson.current = json;
        }
        useClinicStore.getState().replacePersistedState(snapshot);
        ackServerSnapshotVersion(updatedAt, options?.revision);
        const keepDirty = !forceRemoteOnly;
        setClinicDataUnsaved(keepDirty);
        setClinicDataSaveError(null);
        setClinicSaveStatus(keepDirty ? "pending" : "idle");
        if (keepDirty) {
          persistPendingSnapshot(snapshot, { optional: true });
          scheduleDeferredFlush();
        } else {
          clearPendingClinicSnapshot();
        }
      } finally {
        suppressPersistedChange.current = false;
      }
    };

    const serverSnapshotIsNewer = (updatedAt: string | null | undefined) =>
      Boolean(
        updatedAt &&
          lastServerUpdatedAt.current &&
          updatedAt > lastServerUpdatedAt.current
      );

    const clearSavedStatusTimer = () => {
      if (savedStatusTimer.current) {
        clearTimeout(savedStatusTimer.current);
        savedStatusTimer.current = null;
      }
    };

    const markSaveSuccess = () => {
      saveAckCooldownUntil.current = Date.now() + SAVE_ACK_PULL_COOLDOWN_MS;
      staleSignalCount.current = 0;
      clearSavedStatusTimer();
      setClinicSaveStatus("saved");
      setClinicDataUnsaved(false);
      setClinicDataSaveError(null);
      savedStatusTimer.current = setTimeout(() => {
        if (!cancelled) setClinicSaveStatus("idle");
      }, 3000);
    };

    const markSaveFailed = (msg: string) => {
      clearSavedStatusTimer();
      setClinicSaveStatus("failed");
      setClinicDataUnsaved(true);
      setClinicDataSaveError(msg);
    };

    const scheduleDeferredFlush = () => {
      setClinicSaveStatus("pending");
      setClinicDataUnsaved(true);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void flushSave();
      }, SAVE_DEBOUNCE_MS);
    };

    const pendingFailureHandling = { current: false };
    /** В DB-режиме pending — best-effort: не блокируем PUT на сервер */
    const pendingWriteOptional = () => isClinicServerDatabaseMode();

    const handlePendingBufferFailure = () => {
      if (pendingFailureHandling.current) return;
      pendingFailureHandling.current = true;
      try {
        clearOversizedPendingBuffers(0);
        if (pendingWriteOptional()) {
          // Не красная полоса навечно: сразу шлём на сервер без localStorage-буфера
          if (saveTimer.current) clearTimeout(saveTimer.current);
          saveTimer.current = null;
          void flushSave({ skipPendingBuffer: true });
          return;
        }
        markSaveFailed(PENDING_BUFFER_ERROR);
        toast.error(PENDING_BUFFER_ERROR);
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = null;
        void flushSave({ skipPendingBuffer: true });
      } finally {
        queueMicrotask(() => {
          pendingFailureHandling.current = false;
        });
      }
    };

    const persistPendingSnapshot = (
      snapshot: ClinicPersistedState,
      options?: { optional?: boolean }
    ): boolean => {
      if (pendingFailureHandling.current) return Boolean(options?.optional);
      const ok = writePendingClinicSnapshot(snapshot);
      if (ok) return true;
      if (options?.optional || pendingWriteOptional()) return false;
      handlePendingBufferFailure();
      return false;
    };

    const verifySaveAckOnServer = async (expectedUpdatedAt?: string) => {
      if (!expectedUpdatedAt) return false;
      for (const delayMs of VERIFY_SAVE_ACK_RETRY_DELAYS_MS) {
        if (delayMs > 0) await sleep(delayMs);
        const meta = await fetchClinicDataMetaFromServer();
        if (meta?.updatedAt && meta.updatedAt >= expectedUpdatedAt) {
          return true;
        }
      }
      return false;
    };

    const pullRemoteSnapshot = async (options?: {
      force?: boolean;
      allowApplyDespitePending?: boolean;
      allowDuringSaveCooldown?: boolean;
    }) => {
      // Пока идёт command API (смена статуса) — не затираем optimistic store.
      if (isClinicCommandOptimisticUpdate()) {
        pendingPullAfterPull.current = true;
        return;
      }
      const now = Date.now();
      if (!options?.allowDuringSaveCooldown && now < saveAckCooldownUntil.current) {
        const waitMs = saveAckCooldownUntil.current - now + 25;
        if (!pullAfterCooldownTimer.current) {
          pullAfterCooldownTimer.current = setTimeout(() => {
            pullAfterCooldownTimer.current = null;
            void pullRemoteSnapshot(options);
          }, waitMs);
        }
        return;
      }
      if (pulling.current) {
        pendingPullAfterPull.current = true;
        return;
      }
      if (!syncReady.current || syncForbidden.current) return;
      if (saving.current) {
        pendingPullAfterSave.current = true;
        return;
      }
      pulling.current = true;

      try {
        if (!options?.force && lastServerUpdatedAt.current) {
          const meta = await fetchClinicDataMetaFromServer();
          if (!meta || cancelled || meta.forbidden) return;
          if (serverSnapshotIsNewer(meta.updatedAt) && hasProtectableLocalData()) {
            setClinicServerNewerAvailable(true);
            maybeAutoResolveServerNewer();
            if (
              maybeAutoReloadStaleTab(
                "Вкладка устарела относительно сервера. Перезагружаем, чтобы избежать рассинхронизации."
              )
            ) {
              return;
            }
          }
          if (!serverSnapshotIsNewer(meta.updatedAt)) {
            setClinicServerNewerAvailable(false);
            return;
          }
        }

        const remote = await fetchClinicDataFromServer();
        if (!remote?.data || cancelled) return;
        discardStalePendingClinicSnapshot(remote.data);

        const localNow = pickPersistedState(useClinicStore.getState());
        const userForcedPull = Boolean(options?.allowApplyDespitePending);
        const hasUpdates = serverSnapshotHasIncomingUpdates(remote.data, localNow);

        if (!hasUpdates && !userForcedPull) {
          ackServerSnapshotVersion(remote.updatedAt, remote.revision);
          setClinicServerNewerAvailable(false);
          return;
        }

        if (!userForcedPull && hasProtectableLocalData(remote.data)) {
          setClinicServerNewerAvailable(true);
          maybeAutoResolveServerNewer();
          if (
            maybeAutoReloadStaleTab(
              "Обнаружены старые данные вкладки. Перезагружаем для синхронизации."
            )
          ) {
            return;
          }
          return;
        }

        applyRemoteSnapshot(remote.data, remote.updatedAt, {
          revision: remote.revision,
          preferServer: userForcedPull,
        });
        if (userForcedPull) {
          setClinicServerNewerAvailable(false);
        }
      } catch {
        if (!cancelled) setClinicServerNewerAvailable(true);
        maybeAutoReloadStaleTab(
          "Не удаётся подтянуть свежие данные. Перезагружаем устаревшую вкладку."
        );
      } finally {
        pulling.current = false;
        if (pendingPullAfterPull.current) {
          pendingPullAfterPull.current = false;
          void pullRemoteSnapshot();
        }
      }
    };

    const markInitialLoadDone = () => {
      if (!cancelled) initialLoadDone.current = true;
    };

    const armSaveBaseline = () => {
      if (cancelled) return;
      const state = pickPersistedState(useClinicStore.getState());
      lastSavedJson.current = JSON.stringify(state);
      lastTrackedSnap.current = snapFingerprint(state);
      markInitialLoadDone();
      setClinicDataUnsaved(false);
      setClinicSaveStatus("idle");
      setClinicDataSaveError(null);
      if (flushAfterBaseline.current) {
        flushAfterBaseline.current = false;
        void flushSave();
      }
    };

    const saveWithRetry = async (
      snapshot: ClinicPersistedState,
      options?: {
        keepalive?: boolean;
        expectedUpdatedAt?: string | null;
        expectedRevision?: number | null;
      }
    ) => {
      let lastError: string | undefined;
      for (const delayMs of CLINIC_SAVE_RETRY_DELAYS_MS) {
        if (cancelled) return { ok: false as const, error: "Отменено" };
        if (delayMs > 0) await sleep(delayMs);
        const result = await saveClinicDataToServer(snapshot, options);
        if (result.ok || result.forbidden) return result;
        lastError = result.error;
      }
      return { ok: false as const, error: lastError ?? "Не удалось сохранить данные" };
    };

    const isStaleSyncConflictError = (error: string | undefined) =>
      Boolean(
        error &&
          /STALE_BASELINE_REQUIRED|CONFLICT_VERSION_MISMATCH|ACCIDENTAL_PATIENT_MASS_LOSS|ACCIDENTAL_SCHEDULE_MASS_LOSS|конфликт версии|изменены на другом устройстве|устарел|массового удаления пациентов|массового изменения расписания/i.test(
            error
          )
      );

    /** Подтянуть сервер, сохранить локальные правки и обновить CAS baseline */
    const refreshBaselineMergingLocalEdits = async () => {
      const remote = await fetchClinicDataFromServer();
      if (cancelled || !remote?.data) return false;
      discardStalePendingClinicSnapshot(remote.data);
      applyRemoteSnapshot(remote.data, remote.updatedAt, {
        preferServer: false,
        revision: remote.revision,
      });
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      return true;
    };

    const waitUntilNotSaving = async (timeoutMs = 30_000) => {
      const started = Date.now();
      while (saving.current && !cancelled && Date.now() - started < timeoutMs) {
        await sleep(50);
      }
    };

    const flushSave = async (options?: {
      keepalive?: boolean;
      /** Для ручного сценария save+pull: конфликт обрабатывается вызывающим кодом */
      skipStaleLogout?: boolean;
      /** Не требовать запись pending в localStorage (quota / файлы) */
      skipPendingBuffer?: boolean;
    }): Promise<{ ok: boolean; conflict?: boolean }> => {
      if (!syncReady.current || syncForbidden.current || !canWrite.current || saving.current) {
        return { ok: false };
      }
      if (!initialLoadDone.current) {
        flushAfterBaseline.current = true;
        return { ok: false };
      }

      const storeNow = useClinicStore.getState();
      if (storeNow.clinicSyncPhase !== "ready") return { ok: false };
      if (storeNow.clinicSavePausedUntil > Date.now()) return { ok: false };

      const snapshot = pickPersistedState(storeNow);
      if (!hasClinicData(snapshot)) {
        setClinicDataUnsaved(false);
        setClinicSaveStatus("idle");
        return { ok: true };
      }
      let json: string;
      try {
        json = JSON.stringify(snapshot);
      } catch {
        markSaveFailed("Слишком большой объём данных для отправки. Обновите страницу.");
        return { ok: false };
      }
      if (json === lastSavedJson.current) {
        setClinicDataUnsaved(false);
        setClinicSaveStatus("idle");
        return { ok: true };
      }

      setClinicSaveStatus("saving");
      setClinicDataUnsaved(true);
      setClinicDataSaveError(null);

      if (!options?.skipPendingBuffer) {
        // Не блокируем PUT, если localStorage переполнен
        persistPendingSnapshot(snapshot, { optional: true });
      }

      saving.current = true;
      let saveResult: Awaited<ReturnType<typeof saveWithRetry>> | undefined;
      try {
        saveResult = await saveWithRetry(snapshot, {
          keepalive: options?.keepalive,
          expectedUpdatedAt: lastServerUpdatedAt.current,
          expectedRevision: lastServerRevision.current,
        });

        if (saveResult.ok) {
          const acked = await verifySaveAckOnServer(saveResult.updatedAt);
          if (!acked) {
            // При медленном канале meta.updatedAt может отставать.
            // Не переводим в failed: сохраняем как успешную отправку и дотягиваем актуальный snapshot pull'ом.
            setClinicServerNewerAvailable(true);
            pendingPullAfterSave.current = true;
          }

          lastSavedJson.current = json;
          lastTrackedSnap.current = snapFingerprint(snapshot);
          if (saveResult.updatedAt) lastServerUpdatedAt.current = saveResult.updatedAt;
          if (typeof saveResult.revision === "number") {
            lastServerRevision.current = saveResult.revision;
          }
          clearPendingClinicSnapshot();
          const currentJson = JSON.stringify(pickPersistedState(useClinicStore.getState()));
          if (currentJson === json) {
            if (saveResult.merged) {
              toast.info(
                "Данные объединены с сервером — проверьте, что всё на месте"
              );
            }
            markSaveSuccess();
          } else {
            persistPendingSnapshot(pickPersistedState(useClinicStore.getState()), {
              optional: true,
            });
            scheduleDeferredFlush();
          }
          notifyClinicDataChanged();
          return { ok: true };
        } else if (saveResult.forbidden) {
          syncForbidden.current = true;
          syncReady.current = false;
          canWrite.current = false;
          setClinicSaveStatus("failed");
          finishPhase("read_only");
          return { ok: false };
        } else if (saveResult.error) {
          if (isStaleSyncConflictError(saveResult.error)) {
            setClinicServerNewerAvailable(true);
            setClinicSaveStatus("pending");
            setClinicDataUnsaved(true);
            setClinicDataSaveError(null);
            if (options?.skipStaleLogout) {
              return { ok: false, conflict: true };
            }
            try {
              const refreshed = await refreshBaselineMergingLocalEdits();
              if (refreshed && !cancelled) {
                pendingFlushAfterSave.current = true;
                toast.info(
                  "Данные с другого устройства объединены с вашими правками. Повторяем отправку на сервер…"
                );
              }
            } catch {
              /* ignore: оставляем статус pending и даём ручной retry */
            }
            return { ok: false, conflict: true };
          }
          markSaveFailed(saveResult.error);
          toast.error(saveResult.error);
          return { ok: false };
        }
        return { ok: false };
      } catch (e) {
        const msg = clinicSaveErrorMessage(e);
        markSaveFailed(msg);
        toast.error(msg);
        return { ok: false };
      } finally {
        saving.current = false;
        if (pendingFlushAfterSave.current) {
          pendingFlushAfterSave.current = false;
          const currentJson = JSON.stringify(pickPersistedState(useClinicStore.getState()));
          if (currentJson !== lastSavedJson.current) {
            scheduleDeferredFlush();
          }
        }
        if (pendingPullAfterSave.current) {
          pendingPullAfterSave.current = false;
          void pullRemoteSnapshot({ allowDuringSaveCooldown: true });
        } else if (saveResult?.ok && saveResult.merged) {
          void pullRemoteSnapshot({
            force: true,
            allowDuringSaveCooldown: true,
          });
        }
      }
    };

    const runSaveThenPull = async (
      options?: { manual?: boolean; successToast?: boolean }
    ): Promise<{ ok: boolean; conflict?: boolean }> => {
      const manual = options?.manual ?? false;
      const successToast = options?.successToast ?? manual;

      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }

      // Дождаться текущей отправки, иначе flushSave сразу no-op при saving.current
      await waitUntilNotSaving();
      if (cancelled) return { ok: false };
      if (saving.current) {
        if (manual) {
          toast.error("Идёт другая отправка на сервер — подождите пару секунд и нажмите снова.");
        }
        return { ok: false };
      }

      // 1) Сначала сверить baseline с сервером, сохранив локальные правки
      try {
        await refreshBaselineMergingLocalEdits();
      } catch {
        /* всё равно пробуем отправить */
      }
      if (cancelled) return { ok: false };

      // 2) Отправить объединённый снимок с актуальным expectedUpdatedAt
      let result = await flushSave({ skipStaleLogout: true });

      // 3) Если между merge и PUT снова пришёл конфликт — ещё одна попытка
      if (result.conflict) {
        try {
          await refreshBaselineMergingLocalEdits();
        } catch {
          /* ignore */
        }
        if (!cancelled) {
          result = await flushSave({ skipStaleLogout: true });
        }
      }

      if (cancelled) return result;

      if (result.ok && successToast) {
        toast.success("Изменения отправлены, данные обновлены");
      } else if (result.conflict) {
        markSaveFailed(
          "Данные на сервере новее (другое устройство или вкладка). Нажмите «Повторить отправку» или обновите страницу (F5) — иначе запись/пациент могут не сохраниться."
        );
        if (manual) {
          toast.error(
            "Конфликт синхронизации: на сервере уже есть более новые данные. Нажмите «Повторить отправку» или обновите страницу (F5), затем повторите действие."
          );
        }
      }

      // 4) Подтянуть актуальный снимок после попытки отправки
      await pullRemoteSnapshot({
        force: true,
        allowApplyDespitePending: result.ok,
        allowDuringSaveCooldown: true,
      });

      if (!result.ok && !result.conflict && hasUnsavedUserEdits()) {
        setClinicServerNewerAvailable(true);
      }

      return result;
    };

    /** Тихий авто-resolve: очередь → save→pull, иначе force-pull (статусы с сервера сразу) */
    const maybeAutoResolveServerNewer = () => {
      if (isClinicCommandOptimisticUpdate()) return;
      if (autoResolveServerNewerRunning.current) return;
      const now = Date.now();
      if (now - lastAutoResolveServerNewerAt.current < AUTO_SAVE_THEN_PULL_COOLDOWN_MS) {
        return;
      }
      const queue = hasLocalSyncQueue();

      autoResolveServerNewerRunning.current = true;
      lastAutoResolveServerNewerAt.current = now;
      void (async () => {
        try {
          if (queue) {
            await runSaveThenPull({ manual: false, successToast: false });
          } else {
            // preferServer: иначе merge оставлял старый status из локального store
            await pullRemoteSnapshot({
              force: true,
              allowApplyDespitePending: true,
              allowDuringSaveCooldown: true,
            });
          }
        } finally {
          autoResolveServerNewerRunning.current = false;
        }
      })();
    };

    const discardLocalEditsAndPull = async (options?: {
      force?: boolean;
      allowApplyDespitePending?: boolean;
    }) => {
      clearPendingClinicSnapshot();
      const baseline = lastSyncedBaseline();
      suppressPersistedChange.current = true;
      try {
        const json = JSON.stringify(baseline);
        lastSavedJson.current = json;
        lastTrackedSnap.current = snapFingerprint(baseline);
        useClinicStore.getState().replacePersistedState(baseline);
        setClinicDataUnsaved(false);
        setClinicDataSaveError(null);
        setClinicSaveStatus("idle");
      } finally {
        suppressPersistedChange.current = false;
      }
      await pullRemoteSnapshot({ force: true, ...options });
    };

    const onPersistedDataChange = () => {
      if (suppressPersistedChange.current) return;
      if (pendingFailureHandling.current) return;

      const snapshot = pickPersistedState(useClinicStore.getState());

      let snap: string;
      try {
        snap = snapFingerprint(snapshot);
      } catch {
        // Даже без fingerprint продолжаем flush на сервер
        if (!saving.current && syncReady.current && canWrite.current && initialLoadDone.current) {
          scheduleDeferredFlush();
        }
        return;
      }

      // Сначала сравнение: смена clinicSaveStatus / ошибок не должна
      // снова сериализовать и писать весь snapshot в localStorage.
      if (snap === lastTrackedSnap.current) return;

      // Оптимистичный update перед command API — не ставим PUT в очередь
      // (autoMerge на полном snapshot откатывал только что записанный статус).
      if (isClinicCommandOptimisticUpdate()) {
        lastTrackedSnap.current = snap;
        return;
      }

      // pending best-effort; сбой quota не должен рвать UI
      persistPendingSnapshot(snapshot, { optional: true });

      if (saving.current) {
        pendingFlushAfterSave.current = true;
        return;
      }

      if (!syncReady.current || syncForbidden.current || !canWrite.current) return;

      if (!initialLoadDone.current) {
        flushAfterBaseline.current = true;
        return;
      }

      lastTrackedSnap.current = snap;
      scheduleDeferredFlush();
    };

    const onLeavePage = () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      void flushSave({ keepalive: true });
    };

    window.addEventListener("pagehide", onLeavePage);
    window.addEventListener("beforeunload", onLeavePage);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        void flushSave({ keepalive: true });
        return;
      }
      if (document.visibilityState === "visible") {
        void pullRemoteSnapshot({ allowDuringSaveCooldown: true });
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    const onWindowFocus = () => {
      if (document.visibilityState === "visible") {
        void pullRemoteSnapshot({ allowDuringSaveCooldown: true });
      }
    };
    window.addEventListener("focus", onWindowFocus);

    const onOffline = () => {
      if (hasUnsavedUserEdits() && useClinicStore.getState().clinicSaveStatus !== "saved") {
        markSaveFailed(
          "Нет подключения к интернету. Изменения пока только на этом устройстве."
        );
      }
    };
    const onOnline = () => {
      if (hasUnsavedUserEdits()) {
        setClinicDataSaveError(null);
        scheduleDeferredFlush();
      }
      void pullRemoteSnapshot({
        force: true,
        allowDuringSaveCooldown: true,
      });
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);

    periodicTimer.current = setInterval(() => {
      if (!syncReady.current || !canWrite.current || !initialLoadDone.current) return;
      const json = JSON.stringify(pickPersistedState(useClinicStore.getState()));
      if (json !== lastSavedJson.current) void flushSave();
    }, PERIODIC_FLUSH_MS);

    lastUserActivityAt.current = Date.now();
    const markActivity = () => {
      lastUserActivityAt.current = Date.now();
    };
    window.addEventListener("pointerdown", markActivity);
    window.addEventListener("keydown", markActivity);

    const schedulePullTick = () => {
      if (pullTimer.current) clearTimeout(pullTimer.current);
      const last = lastUserActivityAt.current || Date.now();
      const idle = Date.now() - last > IDLE_AFTER_MS;
      const delay = idle ? PERIODIC_PULL_IDLE_MS : PERIODIC_PULL_MS;
      pullTimer.current = setTimeout(() => {
        if (document.visibilityState === "visible") {
          void pullRemoteSnapshot();
        }
        schedulePullTick();
      }, delay);
    };
    schedulePullTick();

    registerAckClinicServerVersion((updatedAt, revision) => {
      ackServerSnapshotVersion(updatedAt, revision);
    });

    registerMarkClinicSyncedAfterCommand((updatedAt, revision) => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      const snapshot = pickPersistedState(useClinicStore.getState());
      try {
        lastSavedJson.current = JSON.stringify(snapshot);
        lastTrackedSnap.current = snapFingerprint(snapshot);
      } catch {
        /* quota / circular — всё равно ack версии */
      }
      ackServerSnapshotVersion(updatedAt, revision);
      setClinicDataUnsaved(false);
      setClinicDataSaveError(null);
      setClinicSaveStatus("idle");
      clearPendingClinicSnapshot();
    });

    registerClinicDataFlush(() => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      void flushSave();
    });

    registerClinicDataFlushAsync(async (options) => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      await flushSave(options);
    });

    registerSaveThenPullClinicData(async () => {
      await runSaveThenPull({ manual: true, successToast: true });
    });

    registerDiscardLocalEditsAndPull(discardLocalEditsAndPull);

    registerForcePullClinicDataFromServer(async (options) => {
      if (isClinicCommandOptimisticUpdate()) {
        pendingPullAfterPull.current = true;
        return;
      }
      // Command API (allowApplyDespitePending): всегда preferServer-pull.
      // Иначе save→pull успевал отправить в store СТАРЫЙ status и затирал сервер.
      if (options?.allowApplyDespitePending) {
        if (saveTimer.current) {
          clearTimeout(saveTimer.current);
          saveTimer.current = null;
        }
        await pullRemoteSnapshot({
          force: true,
          allowApplyDespitePending: true,
          allowDuringSaveCooldown: true,
          ...options,
        });
        return;
      }
      // Ручное обновление: сначала сохранить локальную очередь, потом pull
      if (hasProtectableLocalData()) {
        toast.info("Сначала отправляем ваши изменения, затем подтянем данные с сервера");
        await runSaveThenPull({ manual: true, successToast: true });
        return;
      }
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      await pullRemoteSnapshot({
        force: true,
        allowApplyDespitePending: true,
        allowDuringSaveCooldown: true,
        ...options,
      });
    });

    registerClinicDataPull((options) => {
      void pullRemoteSnapshot(options);
    });

    const applySnapshot = (snapshot: ClinicPersistedState, mergedWithLocal: boolean) => {
      const store = useClinicStore.getState();
      suppressPersistedChange.current = true;
      try {
        if (mergedWithLocal) {
          store.hydratePersistedState(snapshot);
        } else {
          store.replacePersistedState(snapshot);
        }
      } finally {
        suppressPersistedChange.current = false;
      }
    };

    void (async () => {
      try {
        clearOversizedPendingBuffers();
        const bootstrap = await resolveClinicBootstrap();
        const hostSlug = bootstrap.slug;
        const serverUsesDb = bootstrap.usesDb || isClinicServerDatabaseMode();
        if (serverUsesDb) setClinicServerDatabaseMode(true);

        if (hostSlug && !ensureClinicStorageScope(hostSlug)) {
          useClinicStore.getState().replacePersistedState(createFreshPersistedState());
        }

        let remote = await fetchClinicDataFromServer();
        if (cancelled) return;

        if (!remote && serverUsesDb) {
          for (const delayMs of CLINIC_SAVE_RETRY_DELAYS_MS) {
            if (cancelled) return;
            if (delayMs > 0) await sleep(delayMs);
            remote = await fetchClinicDataFromServer();
            if (remote) break;
          }
        }

        if (cancelled) return;

        if (!serverUsesDb && (remote === null || !remote.database)) {
          setClinicServerDatabaseMode(false);
          syncReady.current = true;
          canWrite.current = canWriteClinicDataSync(
            useClinicStore.getState().currentUser.role
          );
          finishPhase("local_only");
          armSaveBaseline();
          useClinicStore.getState().repairPaidActAppointments();
          return;
        }

        if (serverUsesDb && !remote) {
          syncReady.current = false;
          finishPhase("error");
          setClinicDataSaveError(
            "Не удалось загрузить данные с сервера. Обновите страницу (F5)."
          );
          return;
        }

        if (!remote) return;

        setClinicServerDatabaseMode(true);

        const role = useClinicStore.getState().currentUser.role;
        canWrite.current = canWriteClinicDataSync(role);

        if (remote.forbidden || !canReadClinicDataSync(role)) {
          syncForbidden.current = true;
          syncReady.current = false;
          finishPhase("forbidden");
          return;
        }

        if (remote.updatedAt) lastServerUpdatedAt.current = remote.updatedAt;

        if (remote.data) {
          discardStalePendingClinicSnapshot(remote.data);
          const local = pickPersistedState(useClinicStore.getState());
          const serverDbOpts = { serverDatabaseMode: true as const };
          const snapshot = prepareSnapshotAfterServerFetch(remote.data, local, serverDbOpts);

          // prepareSnapshotAfterServerFetch уже выполнил нужный merge; повторно merge в hydrate не нужен
          applySnapshot(snapshot, false);
          syncReady.current = true;
          finishPhase(canWrite.current ? "ready" : "read_only");
          useClinicStore.getState().repairPaidActAppointments();

          if (snapshot.patients.length > remote.data.patients.length) {
            toast.info(
              `Восстановлено карточек по записям на приём: ${snapshot.patients.length - remote.data.patients.length}`
            );
          }

          const needsPush =
            canWrite.current &&
            shouldPushSnapshotAfterServerFetch(remote.data, snapshot, serverDbOpts);

          if (needsPush) {
            void (async () => {
              let pushed = false;
              try {
                const saved = await saveWithRetry(snapshot, {
                  expectedUpdatedAt: remote.updatedAt,
                });
                if (cancelled) return;
                if (saved.ok) {
                  pushed = true;
                  if (saved.updatedAt) lastServerUpdatedAt.current = saved.updatedAt;
                  const json = JSON.stringify(snapshot);
                  lastSavedJson.current = json;
                  lastTrackedSnap.current = snapFingerprint(snapshot);
                  const currentJson = JSON.stringify(
                    pickPersistedState(useClinicStore.getState())
                  );
                  // Не затираем pending, если пользователь уже успел создать данные.
                  if (currentJson === json) {
                    clearPendingClinicSnapshot();
                    markSaveSuccess();
                  } else {
                    persistPendingSnapshot(pickPersistedState(useClinicStore.getState()), {
                      optional: true,
                    });
                    flushAfterBaseline.current = true;
                  }
                  notifyClinicDataChanged();
                } else {
                  if (saved.error) {
                    markSaveFailed(saved.error);
                    toast.error(saved.error);
                  } else {
                    markSaveFailed("Сервер не подтвердил сохранение");
                  }
                }
              } catch (e) {
                const msg = clinicSaveErrorMessage(e);
                markSaveFailed(msg);
                toast.error(msg);
              } finally {
                if (!cancelled) {
                  markInitialLoadDone();
                  if (!pushed || flushAfterBaseline.current) {
                    flushAfterBaseline.current = false;
                    void flushSave();
                  }
                }
              }
            })();
          } else {
            clearPendingClinicSnapshot();
            armSaveBaseline();
          }
          return;
        }

        const hadLocal =
          typeof window !== "undefined" &&
          Boolean(localStorage.getItem(CLINIC_STORAGE_KEY)) &&
          hasClinicData(pickPersistedState(useClinicStore.getState()));
        const localSnapshot = hadLocal
          ? pickPersistedState(useClinicStore.getState())
          : createFreshPersistedState();

        applySnapshot(localSnapshot, true);
        syncReady.current = true;
        finishPhase(canWrite.current ? "ready" : "read_only");
        armSaveBaseline();

        if (canWrite.current && hasClinicData(localSnapshot)) {
          scheduleIdleWork(() => {
            if (cancelled) return;
            void (async () => {
              try {
                const saved = await saveWithRetry(localSnapshot);
                if (cancelled || !saved.ok) return;
                if (saved.updatedAt) lastServerUpdatedAt.current = saved.updatedAt;
                const json = JSON.stringify(localSnapshot);
                lastSavedJson.current = json;
                lastTrackedSnap.current = snapFingerprint(localSnapshot);
                clearPendingClinicSnapshot();
                markSaveSuccess();
                notifyClinicDataChanged();
              } catch (e) {
                markSaveFailed(clinicSaveErrorMessage(e));
                toast.error(clinicSaveErrorMessage(e));
              }
            })();
          });
        }
      } catch (e) {
        if (cancelled) return;
        const msg = syncErrorMessage(e);
        setClinicDataSaveError(msg);
        toast.error(msg);
        syncReady.current = false;
        finishPhase("error");
      } finally {
        window.clearTimeout(loadingWatchdog);
        if (
          !cancelled &&
          useClinicStore.getState().clinicSyncPhase === "loading"
        ) {
          syncReady.current = false;
          finishPhase("error");
          setClinicDataSaveError(
            "Данные клиники не загрузились. Обновите страницу (F5) перед изменениями."
          );
        }
      }
    })();

    const unsub = useClinicStore.subscribe(onPersistedDataChange);
    const unsubBroadcast = subscribeClinicDataChanged(() => {
      // Другая вкладка уже сохранила (в т.ч. статус через command API) — подтянуть сразу
      if (!hasLocalSyncQueue()) {
        void pullRemoteSnapshot({
          force: true,
          allowApplyDespitePending: true,
          allowDuringSaveCooldown: true,
        });
        return;
      }
      maybeAutoResolveServerNewer();
    });
    const unsubCommandMutationEnded = onClinicCommandMutationEnded(() => {
      if (pendingPullAfterPull.current) {
        pendingPullAfterPull.current = false;
        void pullRemoteSnapshot({
          force: true,
          allowApplyDespitePending: true,
          allowDuringSaveCooldown: true,
        });
      }
    });

    return () => {
      cancelled = true;
      window.clearTimeout(loadingWatchdog);
      registerAckClinicServerVersion(null);
      registerMarkClinicSyncedAfterCommand(null);
      unsubCommandMutationEnded();
      registerClinicDataFlush(null);
      registerClinicDataFlushAsync(null);
      registerSaveThenPullClinicData(null);
      registerDiscardLocalEditsAndPull(null);
      registerForcePullClinicDataFromServer(null);
      registerClinicDataPull(null);
      unsub();
      unsubBroadcast();
      window.removeEventListener("pagehide", onLeavePage);
      window.removeEventListener("beforeunload", onLeavePage);
      window.removeEventListener("focus", onWindowFocus);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pointerdown", markActivity);
      window.removeEventListener("keydown", markActivity);
      clearSavedStatusTimer();
      document.removeEventListener("visibilitychange", onVisibility);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (pullAfterCooldownTimer.current) clearTimeout(pullAfterCooldownTimer.current);
      if (periodicTimer.current) clearInterval(periodicTimer.current);
      if (pullTimer.current) clearTimeout(pullTimer.current);
      if (syncReady.current && canWrite.current && !syncForbidden.current) {
        void flushSave({ keepalive: true });
      }
    };
  }, []);

  return null;
}
