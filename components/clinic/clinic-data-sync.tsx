"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  fetchClinicDataFromServer,
  saveClinicDataToServer,
} from "@/lib/clinic-data-client";
import {
  createFreshPersistedState,
  pickPersistedState,
} from "@/lib/clinic-persisted-state";
import { CLINIC_STORAGE_KEY } from "@/lib/initial-clinic-data";
import { useClinicStore } from "@/store/useClinicStore";

const SAVE_DEBOUNCE_MS = 1500;

/** Загрузка данных клиники с сервера и автосохранение при изменениях */
export function ClinicDataSync() {
  const syncReady = useRef(false);
  const saving = useRef(false);
  const lastSavedJson = useRef("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const flushSave = async () => {
      if (!syncReady.current || saving.current) return;
      const snapshot = pickPersistedState(useClinicStore.getState());
      const json = JSON.stringify(snapshot);
      if (json === lastSavedJson.current) return;

      saving.current = true;
      const result = await saveClinicDataToServer(snapshot);
      saving.current = false;

      if (result.ok) {
        lastSavedJson.current = json;
      } else if (result.error) {
        toast.error(result.error);
      }
    };

    const scheduleSave = () => {
      if (!syncReady.current) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void flushSave();
      }, SAVE_DEBOUNCE_MS);
    };

    (async () => {
      const remote = await fetchClinicDataFromServer();
      if (cancelled) return;

      // Без БД — только localStorage
      if (remote === null || !remote.database) {
        syncReady.current = true;
        lastSavedJson.current = JSON.stringify(
          pickPersistedState(useClinicStore.getState())
        );
        return;
      }

      if (remote.data) {
        useClinicStore.getState().hydratePersistedState(remote.data);
        lastSavedJson.current = JSON.stringify(remote.data);
        syncReady.current = true;
        return;
      }

      // На сервере ещё нет данных — отправляем локальные (миграция) или пустое состояние
      const hadLocal =
        typeof window !== "undefined" && Boolean(localStorage.getItem(CLINIC_STORAGE_KEY));
      const localSnapshot = hadLocal
        ? pickPersistedState(useClinicStore.getState())
        : createFreshPersistedState();

      useClinicStore.getState().hydratePersistedState(localSnapshot);
      const saved = await saveClinicDataToServer(localSnapshot);
      if (cancelled) return;

      if (saved.ok) {
        lastSavedJson.current = JSON.stringify(localSnapshot);
      } else if (saved.error) {
        toast.error(saved.error);
      }
      syncReady.current = true;
    })();

    const unsub = useClinicStore.subscribe(scheduleSave);

    return () => {
      cancelled = true;
      unsub();
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (syncReady.current) void flushSave();
    };
  }, []);

  return null;
}
