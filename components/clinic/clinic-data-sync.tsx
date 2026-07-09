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
  type ClinicPersistedState,
} from "@/lib/clinic-persisted-state";
import {
  notifyClinicDataChanged,
  flushClinicDataBeforeSessionEnd,
  registerClinicDataFlush,
  registerClinicDataFlushAsync,
  registerClinicDataPull,
  registerDiscardLocalEditsAndPull,
  registerForcePullClinicDataFromServer,
  registerSaveThenPullClinicData,
  subscribeClinicDataChanged,
} from "@/lib/clinic-data-sync.client";
import { notifySessionChanged } from "@/lib/session-sync.client";
import {
  mergeRemoteSnapshotForPull,
  prepareSnapshotAfterServerFetch,
  serverSnapshotHasIncomingUpdates,
  shouldPushSnapshotAfterServerFetch,
} from "@/lib/clinic-snapshot-load";
import {
  clearPendingClinicSnapshot,
  discardStalePendingClinicSnapshot,
  hasPendingClinicRecoveryData,
  mergePendingIntoClinicSnapshot,
  PENDING_BUFFER_ERROR,
  readPendingClinicSnapshot,
  writePendingClinicSnapshot,
} from "@/lib/clinic-pending-sync";
import { resolveClinicBootstrap } from "@/lib/clinic-bootstrap.client";
import { CLINIC_SAVE_RETRY_DELAYS_MS, sleep } from "@/lib/clinic-save-retry";
import { clinicSaveErrorMessage } from "@/lib/clinic-save-feedback";
import { CLINIC_STORAGE_KEY } from "@/lib/initial-clinic-data";
import { clearPersistedClinicData } from "@/lib/clinic-storage-client";
import { ensureClinicStorageScope } from "@/lib/clinic-storage-scope";
import { useClinicStore } from "@/store/useClinicStore";

const SAVE_DEBOUNCE_MS = 400;
const PERIODIC_FLUSH_MS = 60_000;
/** После успешного PUT не подтягивать сервер автоматически — VPN/медленная сеть */
const SAVE_ACK_PULL_COOLDOWN_MS = 6_000;
/** Лёгкий опрос meta (только updatedAt) — полный snapshot только при изменениях */
const PERIODIC_PULL_MS = 4_000;
const STALE_TAB_AUTO_RELOAD_SIGNALS = 3;
const STALE_TAB_AUTO_RELOAD_COOLDOWN_MS = 120_000;
const STALE_TAB_AUTO_LOGOUT_CONFLICTS = 3;
const STALE_TAB_LAST_RELOAD_KEY = "dc-stale-tab-last-reload";

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
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const periodicTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pullTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pullAfterCooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedStatusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushAfterBaseline = useRef(false);
  const pendingFlushAfterSave = useRef(false);
  const pendingPullAfterSave = useRef(false);
  const pendingPullAfterPull = useRef(false);
  const saveAckCooldownUntil = useRef(0);
  /** Снимок для подписки — без clinicDataUnsaved, иначе бесконечный subscribe */
  const lastTrackedSnap = useRef("");
  const staleSignalCount = useRef(0);
  const versionConflictCount = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const { setClinicSyncPhase, setClinicDataUnsaved, setClinicSaveStatus, setClinicDataSaveError, setClinicServerNewerAvailable } =
      useClinicStore.getState();

    setClinicSyncPhase("loading");
    setClinicDataSaveError(null);

    const finishPhase = (phase: ReturnType<typeof useClinicStore.getState>["clinicSyncPhase"]) => {
      if (!cancelled) setClinicSyncPhase(phase);
    };

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

    const forceLogoutDueToStaleTab = async (message: string) => {
      if (typeof window === "undefined") return;
      toast.error(message, { duration: 8000 });
      try {
        await flushClinicDataBeforeSessionEnd({ keepalive: true });
      } catch {
        /* ignore */
      }
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "same-origin",
          keepalive: true,
        });
      } catch {
        /* ignore */
      }
      clearPendingClinicSnapshot();
      clearPersistedClinicData();
      notifySessionChanged("logout");
      window.location.assign("/login");
    };

    const maybeAutoReloadStaleTab = (reason: string): boolean => {
      if (typeof window === "undefined") return false;
      if (typeof navigator !== "undefined" && !navigator.onLine) return false;
      if (hasUnsavedUserEdits()) return false;
      staleSignalCount.current += 1;
      if (staleSignalCount.current < STALE_TAB_AUTO_RELOAD_SIGNALS) return false;
      const lastReloadAt = Number(localStorage.getItem(STALE_TAB_LAST_RELOAD_KEY) ?? "0");
      if (Date.now() - lastReloadAt < STALE_TAB_AUTO_RELOAD_COOLDOWN_MS) return false;
      localStorage.setItem(STALE_TAB_LAST_RELOAD_KEY, String(Date.now()));
      toast.info(reason, { duration: 5000 });
      window.location.reload();
      return true;
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

    const ackServerSnapshotVersion = (updatedAt?: string | null) => {
      if (updatedAt) lastServerUpdatedAt.current = updatedAt;
      staleSignalCount.current = 0;
      setClinicServerNewerAvailable(false);
    };

    const applyRemoteSnapshot = (
      remote: ClinicPersistedState,
      updatedAt?: string | null,
      options?: { preferServer?: boolean }
    ) => {
      const local = mergePendingIntoClinicSnapshot(pickPersistedState(useClinicStore.getState()));
      const needsRecoveryMerge =
        !options?.preferServer &&
        (hasUnsavedUserEdits() || hasPendingClinicRecoveryData());
      const snapshot = mergeRemoteSnapshotForPull(remote, local, needsRecoveryMerge);
      const json = JSON.stringify(snapshot);
      if (json === lastSavedJson.current) {
        ackServerSnapshotVersion(updatedAt);
        return;
      }
      suppressPersistedChange.current = true;
      try {
        lastTrackedSnap.current = json;
        if (!needsRecoveryMerge) {
          lastSavedJson.current = json;
        }
        useClinicStore.getState().replacePersistedState(snapshot);
        ackServerSnapshotVersion(updatedAt);
        setClinicDataUnsaved(needsRecoveryMerge);
        setClinicDataSaveError(null);
        setClinicSaveStatus(needsRecoveryMerge ? "pending" : "idle");
        if (needsRecoveryMerge) {
          persistPendingSnapshot(snapshot);
          scheduleDeferredFlush();
        } else if (options?.preferServer) {
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

    const handlePendingBufferFailure = () => {
      markSaveFailed(PENDING_BUFFER_ERROR);
      toast.error(PENDING_BUFFER_ERROR);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = null;
      void flushSave();
    };

    const persistPendingSnapshot = (snapshot: ClinicPersistedState): boolean => {
      const ok = writePendingClinicSnapshot(snapshot);
      if (!ok) handlePendingBufferFailure();
      return ok;
    };

    const verifySaveAckOnServer = async (expectedUpdatedAt?: string) => {
      if (!expectedUpdatedAt) return false;
      const meta = await fetchClinicDataMetaFromServer();
      if (!meta?.updatedAt) return false;
      return meta.updatedAt >= expectedUpdatedAt;
    };

    const pullRemoteSnapshot = async (options?: {
      force?: boolean;
      allowApplyDespitePending?: boolean;
      allowDuringSaveCooldown?: boolean;
    }) => {
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
          if (serverSnapshotIsNewer(meta.updatedAt) && hasUnsavedUserEdits()) {
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
          ackServerSnapshotVersion(remote.updatedAt);
          setClinicServerNewerAvailable(false);
          return;
        }

        if (!userForcedPull && hasUnsavedUserEdits()) {
          setClinicServerNewerAvailable(true);
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
      const json = JSON.stringify(pickPersistedState(useClinicStore.getState()));
      lastSavedJson.current = json;
      lastTrackedSnap.current = json;
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
      options?: { keepalive?: boolean; expectedUpdatedAt?: string | null }
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

    const flushSave = async (options?: { keepalive?: boolean }) => {
      if (!syncReady.current || syncForbidden.current || !canWrite.current || saving.current) {
        return;
      }
      if (!initialLoadDone.current) {
        flushAfterBaseline.current = true;
        return;
      }

      const storeNow = useClinicStore.getState();
      if (storeNow.clinicSyncPhase !== "ready") return;
      if (storeNow.clinicSavePausedUntil > Date.now()) return;

      const snapshot = pickPersistedState(storeNow);
      if (!hasClinicData(snapshot)) {
        setClinicDataUnsaved(false);
        setClinicSaveStatus("idle");
        return;
      }
      const json = JSON.stringify(snapshot);
      if (json === lastSavedJson.current) {
        setClinicDataUnsaved(false);
        setClinicSaveStatus("idle");
        return;
      }

      setClinicSaveStatus("saving");
      setClinicDataUnsaved(true);
      setClinicDataSaveError(null);

      if (!persistPendingSnapshot(snapshot)) {
        return;
      }

      saving.current = true;
      let saveResult: Awaited<ReturnType<typeof saveWithRetry>> | undefined;
      try {
        saveResult = await saveWithRetry(snapshot, {
          keepalive: options?.keepalive,
          expectedUpdatedAt: lastServerUpdatedAt.current,
        });

        if (saveResult.ok) {
          versionConflictCount.current = 0;
          const acked = await verifySaveAckOnServer(saveResult.updatedAt);
          if (!acked) {
            markSaveFailed(
              "Сервер не подтвердил сохранение (часто из‑за VPN или медленной сети). Нажмите «Повторить отправку»."
            );
            toast.error("Данные могли не дойти до сервера — повторите отправку");
            return;
          }

          lastSavedJson.current = json;
          lastTrackedSnap.current = json;
          if (saveResult.updatedAt) lastServerUpdatedAt.current = saveResult.updatedAt;
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
            if (!persistPendingSnapshot(pickPersistedState(useClinicStore.getState()))) {
              /* flush already scheduled in handlePendingBufferFailure */
            } else {
              scheduleDeferredFlush();
            }
          }
          notifyClinicDataChanged();
        } else if (saveResult.forbidden) {
          versionConflictCount.current = 0;
          syncForbidden.current = true;
          syncReady.current = false;
          canWrite.current = false;
          setClinicSaveStatus("failed");
          finishPhase("read_only");
        } else if (saveResult.error) {
          if (
            /CONFLICT_VERSION_MISMATCH|конфликт версии|изменены на другом устройстве/i.test(
              saveResult.error
            )
          ) {
            versionConflictCount.current += 1;
            if (versionConflictCount.current >= STALE_TAB_AUTO_LOGOUT_CONFLICTS) {
              await forceLogoutDueToStaleTab(
                "Сессия в этой вкладке слишком устарела. Выполнен выход для безопасного повторного входа."
              );
              return;
            }
          } else {
            versionConflictCount.current = 0;
          }
          markSaveFailed(saveResult.error);
          toast.error(saveResult.error);
        }
      } catch (e) {
        const msg = clinicSaveErrorMessage(e);
        markSaveFailed(msg);
        toast.error(msg);
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
        lastTrackedSnap.current = json;
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

      const snapshot = pickPersistedState(useClinicStore.getState());
      if (!persistPendingSnapshot(snapshot)) return;

      if (saving.current) {
        pendingFlushAfterSave.current = true;
        return;
      }

      if (!syncReady.current || syncForbidden.current || !canWrite.current) return;

      if (!initialLoadDone.current) {
        flushAfterBaseline.current = true;
        return;
      }

      const snap = JSON.stringify(snapshot);
      if (snap === lastTrackedSnap.current) return;
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

    pullTimer.current = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void pullRemoteSnapshot();
    }, PERIODIC_PULL_MS);

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
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      await flushSave();
      await pullRemoteSnapshot({ force: true, allowDuringSaveCooldown: true });
    });

    registerDiscardLocalEditsAndPull(discardLocalEditsAndPull);

    registerForcePullClinicDataFromServer(async (options) => {
      clearPendingClinicSnapshot();
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
                  lastTrackedSnap.current = json;
                  clearPendingClinicSnapshot();
                  markSaveSuccess();
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
                  if (!pushed) void flushSave();
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
                lastTrackedSnap.current = json;
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
      void pullRemoteSnapshot({ allowDuringSaveCooldown: true });
    });

    return () => {
      cancelled = true;
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
      clearSavedStatusTimer();
      document.removeEventListener("visibilitychange", onVisibility);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (pullAfterCooldownTimer.current) clearTimeout(pullAfterCooldownTimer.current);
      if (periodicTimer.current) clearInterval(periodicTimer.current);
      if (pullTimer.current) clearInterval(pullTimer.current);
      if (syncReady.current && canWrite.current && !syncForbidden.current) {
        void flushSave({ keepalive: true });
      }
    };
  }, []);

  return null;
}
