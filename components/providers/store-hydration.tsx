"use client";

import { useEffect, useState } from "react";
import {
  isClinicServerDatabaseMode,
  setClinicServerDatabaseMode,
} from "@/lib/clinic-client-mode";
import { resolveClinicBootstrap } from "@/lib/clinic-bootstrap.client";
import { backupPhiSnapshotBeforeDbMode } from "@/lib/clinic-pending-sync";
import { createFreshPersistedState } from "@/lib/clinic-persisted-state";
import { purgePhiFromClinicLocalStorage } from "@/lib/clinic-storage-client";
import { ensureClinicStorageScope } from "@/lib/clinic-storage-scope";
import { LEGACY_CLINIC_STORAGE_KEYS } from "@/lib/initial-clinic-data";
import {
  mergeThemePreferences,
  readThemePreferencesFromStorage,
} from "@/lib/user-theme-storage";
import { useClinicStore } from "@/store/useClinicStore";

const WIPE_DONE_KEY = "dentalcloud-mis-wiped-v4";

function applyServerBootstrap(usesDb: boolean, slug: string | null): void {
  if (slug && !ensureClinicStorageScope(slug)) {
    const themes = useClinicStore.getState().userThemePreferences;
    useClinicStore.getState().replacePersistedState({
      ...createFreshPersistedState(),
      userThemePreferences: themes,
    });
  }

  if (usesDb) {
    setClinicServerDatabaseMode(true);
    backupPhiSnapshotBeforeDbMode();
    purgePhiFromClinicLocalStorage();
  }
}

export function StoreHydration({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

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
      if (!cancelled) setReady(true);
    };

    void (async () => {
      const { usesDb, slug } = await resolveClinicBootstrap();
      if (cancelled) return;
      applyServerBootstrap(usesDb, slug);
      void useClinicStore.persist.rehydrate().then(() => {
        if (!cancelled) finish();
      });
    })();

    return () => {
      cancelled = true;
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
