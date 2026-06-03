"use client";

import { useEffect, useState } from "react";
import {
  isClinicServerDatabaseMode,
  setClinicServerDatabaseMode,
} from "@/lib/clinic-client-mode";
import { backupPhiSnapshotBeforeDbMode } from "@/lib/clinic-pending-sync";
import { purgePhiFromClinicLocalStorage } from "@/lib/clinic-storage-client";
import { LEGACY_CLINIC_STORAGE_KEYS } from "@/lib/initial-clinic-data";
import {
  mergeThemePreferences,
  readThemePreferencesFromStorage,
} from "@/lib/user-theme-storage";
import { useClinicStore } from "@/store/useClinicStore";

const WIPE_DONE_KEY = "dentalcloud-mis-wiped-v4";

async function detectServerDatabaseMode(): Promise<boolean> {
  try {
    const res = await fetch("/api/clinic/context", { credentials: "same-origin" });
    if (!res.ok) return false;
    const data = (await res.json()) as { database?: boolean; mode?: string };
    return data.mode === "clinic" && data.database === true;
  } catch {
    return false;
  }
}

export function StoreHydration({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let unsubPersist: (() => void) | undefined;

    const finish = () => {
      if (typeof window !== "undefined") {
        const hadLegacy = LEGACY_CLINIC_STORAGE_KEYS.some((k) => localStorage.getItem(k));
        if (hadLegacy) {
          useClinicStore.getState().resetAllData();
          localStorage.setItem(WIPE_DONE_KEY, "1");
        } else {
          const storedThemes = readThemePreferencesFromStorage();
          const state = useClinicStore.getState();
          useClinicStore.setState({
            userThemePreferences: mergeThemePreferences(
              storedThemes,
              state.userThemePreferences
            ),
          });
        }
        if (isClinicServerDatabaseMode()) {
          purgePhiFromClinicLocalStorage();
        }
      }
      setReady(true);
    };

    void (async () => {
      const usesDb = await detectServerDatabaseMode();
      if (cancelled) return;
      if (usesDb) {
        setClinicServerDatabaseMode(true);
        backupPhiSnapshotBeforeDbMode();
        purgePhiFromClinicLocalStorage();
      }
      unsubPersist = useClinicStore.persist.onFinishHydration(finish);
      void useClinicStore.persist.rehydrate();
    })();

    return () => {
      cancelled = true;
      unsubPersist?.();
    };
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-slate-500">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
        <p className="text-sm">Загрузка данных...</p>
      </div>
    );
  }

  return <>{children}</>;
}
