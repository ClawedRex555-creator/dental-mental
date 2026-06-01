"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearPersistedClinicData } from "@/lib/clinic-storage-client";
import { useClinicStore } from "@/store/useClinicStore";

type AuthState = "loading" | "authed" | "denied";

/** Сессия с сервера + блокировка dashboard без входа */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const setSessionUser = useClinicStore((s) => s.setSessionUser);
  const setEnabledModules = useClinicStore((s) => s.setEnabledModules);
  const clearSession = useClinicStore((s) => s.clearSession);
  const [state, setState] = useState<AuthState>("loading");

  useEffect(() => {
    let cancelled = false;

    const syncSession = async (redirectOnFail: boolean) => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (cancelled) return;

        if (res.ok) {
          const data = await res.json();
          setSessionUser(data.user);
          const modRes = await fetch("/api/clinic/modules", { credentials: "include" });
          if (modRes.ok) {
            const modData = await modRes.json();
            setEnabledModules(modData.modules);
          }
          setState("authed");
          return;
        }

        if (!redirectOnFail) return;
        clearSession();
        clearPersistedClinicData();
        setState("denied");
        if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
          router.replace("/login");
        }
      } catch {
        if (cancelled) return;
        if (!redirectOnFail) return;
        clearSession();
        clearPersistedClinicData();
        setState("denied");
        if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
          router.replace("/login");
        }
      }
    };

    void syncSession(true);

    const onFocus = () => {
      void syncSession(false);
    };
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [setSessionUser, setEnabledModules, clearSession, router]);

  if (state === "loading") {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-[var(--muted)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
        <p className="text-sm">Проверка доступа…</p>
      </div>
    );
  }

  if (state === "denied") return null;

  return <>{children}</>;
}
