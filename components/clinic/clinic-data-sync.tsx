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
  mergeClinicSnapshotWithLocal,
  pickPersistedState,
  type ClinicPersistedState,
} from "@/lib/clinic-persisted-state";
import {
  notifyClinicDataChanged,
  registerClinicDataFlush,
  subscribeClinicDataChanged,
} from "@/lib/clinic-data-sync.client";
import {
  needsMergeWithServerOnLoad,
  prepareSnapshotAfterServerFetch,
  shouldPushSnapshotAfterServerFetch,
} from "@/lib/clinic-snapshot-load";
import {
  clearPendingClinicSnapshot,
  readPendingClinicSnapshot,
  writePendingClinicSnapshot,
} from "@/lib/clinic-pending-sync";
import { resolveClinicBootstrap } from "@/lib/clinic-bootstrap.client";
import { CLINIC_SAVE_RETRY_DELAYS_MS, sleep } from "@/lib/clinic-save-retry";
import { CLINIC_STORAGE_KEY } from "@/lib/initial-clinic-data";
import { ensureClinicStorageScope } from "@/lib/clinic-storage-scope";
import { useClinicStore } from "@/store/useClinicStore";

const SAVE_DEBOUNCE_MS = 800;
const PERIODIC_FLUSH_MS = 60_000;
/** Лёгкий опрос meta (только updatedAt) — полный snapshot только при изменениях */
const PERIODIC_PULL_MS = 4_000;

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
  /** replacePersistedState синхронно дергает subscribe — не считать это правкой пользователя */
  const suppressPersistedChange = useRef(false);
  const lastSavedJson = useRef("");
  const lastServerUpdatedAt = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const periodicTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pullTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const flushAfterBaseline = useRef(false);
  /** Снимок для подписки — без clinicDataUnsaved, иначе бесконечный subscribe */
  const lastTrackedSnap = useRef("");

  useEffect(() => {
    let cancelled = false;
    const { setClinicSyncPhase, setClinicDataUnsaved, setClinicDataSaveError } =
      useClinicStore.getState();

    setClinicSyncPhase("loading");
    setClinicDataSaveError(null);

    const finishPhase = (phase: ReturnType<typeof useClinicStore.getState>["clinicSyncPhase"]) => {
      if (!cancelled) setClinicSyncPhase(phase);
    };

    const hasPendingLocalEdits = () => {
      if (readPendingClinicSnapshot()) return true;
      const store = useClinicStore.getState();
      if (store.clinicDataUnsaved) return true;
      if (saveTimer.current) return true;
      const json = JSON.stringify(pickPersistedState(store));
      return json !== lastSavedJson.current;
    };

    const applyRemoteSnapshot = (remote: ClinicPersistedState, updatedAt?: string | null) => {
      const local = pickPersistedState(useClinicStore.getState());
      // При pull с сервера приоритет у remote; локальные id, которых нет на сервере, сохраняем
      const snapshot = mergeClinicSnapshotWithLocal(local, remote);
      const json = JSON.stringify(snapshot);
      if (json === lastSavedJson.current) return;
      suppressPersistedChange.current = true;
      try {
        lastSavedJson.current = json;
        lastTrackedSnap.current = json;
        useClinicStore.getState().replacePersistedState(snapshot);
        if (updatedAt) lastServerUpdatedAt.current = updatedAt;
        setClinicDataUnsaved(false);
        setClinicDataSaveError(null);
      } finally {
        suppressPersistedChange.current = false;
      }
    };

    const pullRemoteSnapshot = async (options?: { force?: boolean }) => {
      if (!syncReady.current || syncForbidden.current || saving.current) return;
      if (hasPendingLocalEdits()) return;
      try {
        if (!options?.force && lastServerUpdatedAt.current) {
          const meta = await fetchClinicDataMetaFromServer();
          if (!meta || cancelled || meta.forbidden) return;
          if (hasPendingLocalEdits()) return;
          if (
            meta.updatedAt &&
            lastServerUpdatedAt.current &&
            meta.updatedAt <= lastServerUpdatedAt.current
          ) {
            return;
          }
        }

        const remote = await fetchClinicDataFromServer();
        if (!remote?.data || cancelled) return;
        if (hasPendingLocalEdits()) return;
        applyRemoteSnapshot(remote.data, remote.updatedAt);
      } catch {
        /* ignore background refresh */
      }
    };

    const armSaveBaseline = () => {
      if (cancelled) return;
      const json = JSON.stringify(pickPersistedState(useClinicStore.getState()));
      lastSavedJson.current = json;
      lastTrackedSnap.current = json;
      initialLoadDone.current = true;
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
        return;
      }
      const json = JSON.stringify(snapshot);
      if (json === lastSavedJson.current) {
        setClinicDataUnsaved(false);
        return;
      }

      writePendingClinicSnapshot(snapshot);
      setClinicDataUnsaved(true);
      setClinicDataSaveError(null);

      saving.current = true;
      let saveResult: Awaited<ReturnType<typeof saveWithRetry>> | undefined;
      try {
        saveResult = await saveWithRetry(snapshot, {
          keepalive: options?.keepalive,
          expectedUpdatedAt: lastServerUpdatedAt.current,
        });

      if (saveResult.ok) {
        lastSavedJson.current = json;
        lastTrackedSnap.current = json;
        if (saveResult.updatedAt) lastServerUpdatedAt.current = saveResult.updatedAt;
        clearPendingClinicSnapshot();
        setClinicDataUnsaved(false);
        setClinicDataSaveError(null);
        notifyClinicDataChanged();
        } else if (saveResult.forbidden) {
          syncForbidden.current = true;
          syncReady.current = false;
          canWrite.current = false;
          finishPhase("read_only");
        } else if (saveResult.error) {
          setClinicDataSaveError(saveResult.error);
          toast.error(saveResult.error);
        }
      } catch (e) {
        const msg = syncErrorMessage(e);
        setClinicDataSaveError(msg);
        toast.error(msg);
      } finally {
        saving.current = false;
        if (saveResult?.ok && saveResult.merged) {
          void pullRemoteSnapshot();
        }
      }
    };

    const onPersistedDataChange = () => {
      if (suppressPersistedChange.current) return;
      if (!syncReady.current || syncForbidden.current || !canWrite.current) return;
      if (saving.current) return;

      const snapshot = pickPersistedState(useClinicStore.getState());
      writePendingClinicSnapshot(snapshot);

      if (!initialLoadDone.current) {
        flushAfterBaseline.current = true;
        return;
      }

      const snap = JSON.stringify(snapshot);
      if (snap === lastTrackedSnap.current) return;
      lastTrackedSnap.current = snap;

      setClinicDataUnsaved(true);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void flushSave();
      }, SAVE_DEBOUNCE_MS);
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
        void pullRemoteSnapshot({ force: true });
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    const onWindowFocus = () => {
      if (document.visibilityState === "visible") {
        void pullRemoteSnapshot({ force: true });
      }
    };
    window.addEventListener("focus", onWindowFocus);

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
        let hostSlug = bootstrap.slug;
        let serverUsesDb = bootstrap.usesDb || isClinicServerDatabaseMode();
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
          const local = pickPersistedState(useClinicStore.getState());
          const serverDbOpts = { serverDatabaseMode: true as const };
          const mustMerge = needsMergeWithServerOnLoad(local, serverDbOpts);
          const snapshot = prepareSnapshotAfterServerFetch(remote.data, local, serverDbOpts);

          applySnapshot(snapshot, mustMerge);
          syncReady.current = true;
          finishPhase(canWrite.current ? "ready" : "read_only");

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
                  setClinicDataUnsaved(false);
                  notifyClinicDataChanged();
                } else {
                  setClinicDataUnsaved(true);
                  if (saved.error) toast.error(saved.error);
                }
              } catch (e) {
                setClinicDataUnsaved(true);
                toast.error(syncErrorMessage(e));
              } finally {
                if (!cancelled) {
                  armSaveBaseline();
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
                setClinicDataUnsaved(false);
              } catch (e) {
                toast.error(syncErrorMessage(e));
              }
            })();
          });
        }
      } catch (e) {
        if (cancelled) return;
        const msg = syncErrorMessage(e);
        setClinicDataSaveError(msg);
        toast.error(msg);
        syncReady.current = true;
        finishPhase("error");
        armSaveBaseline();
      } finally {
        if (
          !cancelled &&
          useClinicStore.getState().clinicSyncPhase === "loading"
        ) {
          syncReady.current = true;
          finishPhase("error");
          setClinicDataSaveError(
            "Данные клиники не загрузились. Обновите страницу (F5) перед изменениями."
          );
        }
      }
    })();

    const unsub = useClinicStore.subscribe(onPersistedDataChange);
    const unsubBroadcast = subscribeClinicDataChanged(() => {
      void pullRemoteSnapshot();
    });

    return () => {
      cancelled = true;
      registerClinicDataFlush(null);
      unsub();
      unsubBroadcast();
      window.removeEventListener("pagehide", onLeavePage);
      window.removeEventListener("beforeunload", onLeavePage);
      window.removeEventListener("focus", onWindowFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (periodicTimer.current) clearInterval(periodicTimer.current);
      if (pullTimer.current) clearInterval(pullTimer.current);
      if (syncReady.current && canWrite.current && !syncForbidden.current) {
        void flushSave({ keepalive: true });
      }
    };
  }, []);

  return null;
}
