"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  fetchClinicDataFromServer,
  saveClinicDataToServer,
} from "@/lib/clinic-data-client";
import { setClinicServerDatabaseMode } from "@/lib/clinic-client-mode";
import { canAccessFullClinicDataSync } from "@/lib/clinic-data-access";
import {
  createFreshPersistedState,
  hasClinicData,
  pickPersistedState,
} from "@/lib/clinic-persisted-state";
import { CLINIC_STORAGE_KEY } from "@/lib/initial-clinic-data";
import { useClinicStore } from "@/store/useClinicStore";

const SAVE_DEBOUNCE_MS = 1500;

/** Загрузка данных клиники с сервера и автосохранение (только owner/admin) */
export function ClinicDataSync() {
  const syncReady = useRef(false);
  const syncForbidden = useRef(false);
  const saving = useRef(false);
  const lastSavedJson = useRef("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const flushSave = async () => {
      if (!syncReady.current || syncForbidden.current || saving.current) return;
      const role = useClinicStore.getState().currentUser.role;
      if (!canAccessFullClinicDataSync(role)) return;

      const snapshot = pickPersistedState(useClinicStore.getState());
      const json = JSON.stringify(snapshot);
      if (json === lastSavedJson.current) return;

      saving.current = true;
      const result = await saveClinicDataToServer(snapshot);
      saving.current = false;

      if (result.ok) {
        lastSavedJson.current = json;
      } else if (result.forbidden) {
        syncForbidden.current = true;
        syncReady.current = false;
      } else if (result.error) {
        toast.error(result.error);
      }
    };

    const scheduleSave = () => {
      if (!syncReady.current || syncForbidden.current) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void flushSave();
      }, SAVE_DEBOUNCE_MS);
    };

    (async () => {
      const remote = await fetchClinicDataFromServer();
      if (cancelled) return;

      if (remote === null || !remote.database) {
        setClinicServerDatabaseMode(false);
        syncReady.current = true;
        lastSavedJson.current = JSON.stringify(
          pickPersistedState(useClinicStore.getState())
        );
        return;
      }

      setClinicServerDatabaseMode(true);

      const role = useClinicStore.getState().currentUser.role;
      if (remote.forbidden || !canAccessFullClinicDataSync(role)) {
        syncForbidden.current = true;
        syncReady.current = false;
        return;
      }

      if (remote.data) {
        useClinicStore.getState().hydratePersistedState(remote.data);
        lastSavedJson.current = JSON.stringify(remote.data);
        syncReady.current = true;
        return;
      }

      const hadLocal =
        typeof window !== "undefined" && Boolean(localStorage.getItem(CLINIC_STORAGE_KEY));
      const localSnapshot = hadLocal
        ? pickPersistedState(useClinicStore.getState())
        : createFreshPersistedState();

      useClinicStore.getState().hydratePersistedState(localSnapshot);

      if (hasClinicData(localSnapshot)) {
        const saved = await saveClinicDataToServer(localSnapshot);
        if (cancelled) return;

        if (saved.ok) {
          lastSavedJson.current = JSON.stringify(localSnapshot);
        } else if (saved.forbidden) {
          syncForbidden.current = true;
          syncReady.current = false;
          return;
        } else if (saved.error) {
          toast.error(saved.error);
        }
      } else {
        lastSavedJson.current = JSON.stringify(localSnapshot);
      }
      syncReady.current = true;
    })();

    const unsub = useClinicStore.subscribe(scheduleSave);

    return () => {
      cancelled = true;
      unsub();
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (syncReady.current && !syncForbidden.current) void flushSave();
    };
  }, []);

  return null;
}
