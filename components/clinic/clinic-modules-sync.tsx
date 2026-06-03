"use client";

import { useEffect } from "react";
import { useClinicStore } from "@/store/useClinicStore";

const REFRESH_MS = 30_000;

/** Подтягивает модули клиники с сервера (супер-админ может менять без перелогина) */
export function ClinicModulesSync() {
  const setEnabledModules = useClinicStore((s) => s.setEnabledModules);
  const userId = useClinicStore((s) => s.currentUser.id);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    const refresh = async () => {
      try {
        const res = await fetch("/api/clinic/modules", {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (data.modules) setEnabledModules(data.modules);
      } catch {
        /* ignore */
      }
    };

    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [userId, setEnabledModules]);

  return null;
}
