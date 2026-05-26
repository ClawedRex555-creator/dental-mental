"use client";

import { useEffect } from "react";
import { useClinicStore } from "@/store/useClinicStore";

/** Подтягивает сессию из cookie в store после загрузки */
export function SessionSync() {
  const setSessionUser = useClinicStore((s) => s.setSessionUser);
  const clearSession = useClinicStore((s) => s.clearSession);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setSessionUser(data.user);
        } else {
          clearSession();
        }
      } catch {
        if (!cancelled) clearSession();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setSessionUser, clearSession]);

  return null;
}
