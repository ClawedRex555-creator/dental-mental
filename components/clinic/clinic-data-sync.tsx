"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  fetchClinicDataFromServer,
  saveClinicDataToServer,
} from "@/lib/clinic-data-client";
import { setClinicServerDatabaseMode } from "@/lib/clinic-client-mode";
import {
  canReadClinicDataSync,
  canWriteClinicDataSync,
} from "@/lib/clinic-data-access";
import { FetchTimeoutError } from "@/lib/fetch-with-timeout";
import {
  createFreshPersistedState,
  hasClinicData,
  pickPersistedState,
  type ClinicPersistedState,
} from "@/lib/clinic-persisted-state";
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
import { CLINIC_SAVE_RETRY_DELAYS_MS, sleep } from "@/lib/clinic-save-retry";
import { CLINIC_STORAGE_KEY } from "@/lib/initial-clinic-data";
import { ensureClinicStorageScope } from "@/lib/clinic-storage-scope";
import { useClinicStore } from "@/store/useClinicStore";

const SAVE_DEBOUNCE_MS = 2000;
const PERIODIC_FLUSH_MS = 60_000;

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
  const lastSavedJson = useRef("");
  const lastServerUpdatedAt = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const periodicTimer = useRef<ReturnType<typeof setInterval> | null>(null);
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

    const armSaveBaseline = () => {
      scheduleIdleWork(() => {
        if (cancelled) return;
        const json = JSON.stringify(pickPersistedState(useClinicStore.getState()));
        lastSavedJson.current = json;
        lastTrackedSnap.current = json;
        initialLoadDone.current = true;
      });
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
      if (!initialLoadDone.current) return;

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
      try {
        const result = await saveWithRetry(snapshot, {
          keepalive: options?.keepalive,
          expectedUpdatedAt: lastServerUpdatedAt.current,
        });

      if (result.ok) {
        lastSavedJson.current = json;
        lastTrackedSnap.current = json;
        if (result.updatedAt) lastServerUpdatedAt.current = result.updatedAt;
        clearPendingClinicSnapshot();
        setClinicDataUnsaved(false);
        setClinicDataSaveError(null);
        } else if (result.forbidden) {
          syncForbidden.current = true;
          syncReady.current = false;
          canWrite.current = false;
          finishPhase("read_only");
        } else if (result.error) {
          setClinicDataSaveError(result.error);
          toast.error(result.error);
        }
      } catch (e) {
        const msg = syncErrorMessage(e);
        setClinicDataSaveError(msg);
        toast.error(msg);
      } finally {
        saving.current = false;
      }
    };

    const onPersistedDataChange = () => {
      if (!syncReady.current || syncForbidden.current || !canWrite.current) return;
      if (!initialLoadDone.current) return;
      if (saving.current) return;

      const snap = JSON.stringify(pickPersistedState(useClinicStore.getState()));
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
      if (document.visibilityState === "hidden") void flushSave({ keepalive: true });
    };
    document.addEventListener("visibilitychange", onVisibility);

    periodicTimer.current = setInterval(() => {
      if (!syncReady.current || !canWrite.current || !initialLoadDone.current) return;
      const json = JSON.stringify(pickPersistedState(useClinicStore.getState()));
      if (json !== lastSavedJson.current) void flushSave();
    }, PERIODIC_FLUSH_MS);

    const applySnapshot = (snapshot: ClinicPersistedState, mergedWithLocal: boolean) => {
      const store = useClinicStore.getState();
      if (mergedWithLocal) {
        store.hydratePersistedState(snapshot);
      } else {
        store.replacePersistedState(snapshot);
      }
    };

    void (async () => {
      try {
        let hostSlug: string | null = null;
        try {
          const ctxRes = await fetch("/api/clinic/context", { credentials: "include" });
          if (ctxRes.ok) {
            const ctx = (await ctxRes.json()) as { slug?: string; mode?: string };
            if (ctx.mode === "clinic" && ctx.slug) hostSlug = ctx.slug;
          }
        } catch {
          /* scope check best-effort */
        }
        if (hostSlug && !ensureClinicStorageScope(hostSlug)) {
          useClinicStore.getState().replacePersistedState(createFreshPersistedState());
        }

        const remote = await fetchClinicDataFromServer();
        if (cancelled) return;

        if (remote === null || !remote.database) {
          setClinicServerDatabaseMode(false);
          syncReady.current = true;
          canWrite.current = canWriteClinicDataSync(
            useClinicStore.getState().currentUser.role
          );
          finishPhase("local_only");
          armSaveBaseline();
          return;
        }

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
          const mustMerge = needsMergeWithServerOnLoad(local);
          const snapshot = prepareSnapshotAfterServerFetch(remote.data, local);

          applySnapshot(snapshot, mustMerge);
          syncReady.current = true;
          finishPhase(canWrite.current ? "ready" : "read_only");

          if (snapshot.patients.length > remote.data.patients.length) {
            toast.info(
              `Восстановлено карточек по записям на приём: ${snapshot.patients.length - remote.data.patients.length}`
            );
          }

          armSaveBaseline();

          if (canWrite.current && shouldPushSnapshotAfterServerFetch(remote.data, snapshot)) {
            scheduleIdleWork(() => {
              if (cancelled) return;
              void (async () => {
                try {
                  const saved = await saveWithRetry(snapshot, {
                    expectedUpdatedAt: remote.updatedAt,
                  });
                  if (cancelled || !saved.ok) return;
                  if (saved.updatedAt) lastServerUpdatedAt.current = saved.updatedAt;
                  const json = JSON.stringify(snapshot);
                  lastSavedJson.current = json;
                  lastTrackedSnap.current = json;
                  clearPendingClinicSnapshot();
                  setClinicDataUnsaved(false);
                } catch (e) {
                  toast.error(syncErrorMessage(e));
                }
              })();
            });
          } else {
            clearPendingClinicSnapshot();
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

    return () => {
      cancelled = true;
      unsub();
      window.removeEventListener("pagehide", onLeavePage);
      window.removeEventListener("beforeunload", onLeavePage);
      document.removeEventListener("visibilitychange", onVisibility);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (periodicTimer.current) clearInterval(periodicTimer.current);
      if (syncReady.current && canWrite.current && !syncForbidden.current) {
        void flushSave({ keepalive: true });
      }
    };
  }, []);

  return null;
}
