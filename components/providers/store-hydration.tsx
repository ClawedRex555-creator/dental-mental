"use client";

import { useEffect, useState } from "react";
import { LEGACY_CLINIC_STORAGE_KEYS } from "@/lib/initial-clinic-data";
import { useClinicStore } from "@/store/useClinicStore";

const WIPE_DONE_KEY = "dentalcloud-mis-wiped-v4";

export function StoreHydration({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const finish = () => {
      if (typeof window !== "undefined") {
        const hadLegacy = LEGACY_CLINIC_STORAGE_KEYS.some((k) => localStorage.getItem(k));
        const notWipedYet = !localStorage.getItem(WIPE_DONE_KEY);
        if (hadLegacy || notWipedYet) {
          useClinicStore.getState().resetAllData();
          localStorage.setItem(WIPE_DONE_KEY, "1");
        }
      }
      setReady(true);
    };

    const unsub = useClinicStore.persist.onFinishHydration(finish);
    void useClinicStore.persist.rehydrate();
    return unsub;
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
