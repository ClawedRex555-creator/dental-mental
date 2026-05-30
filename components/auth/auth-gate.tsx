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
  const clearSession = useClinicStore((s) => s.clearSession);
  const [state, setState] = useState<AuthState>("loading");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "same-origin" });
        if (cancelled) return;

        if (res.ok) {
          const data = await res.json();
          setSessionUser(data.user);
          setState("authed");
          return;
        }

        clearSession();
        clearPersistedClinicData();
        setState("denied");
        router.replace("/login");
      } catch {
        if (cancelled) return;
        clearSession();
        clearPersistedClinicData();
        setState("denied");
        router.replace("/login");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [setSessionUser, clearSession, router]);

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
