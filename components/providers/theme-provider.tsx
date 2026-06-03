"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { parseClinicSlugFromHost } from "@/lib/clinic-host";
import { applyDocumentTheme, resolveUserTheme } from "@/lib/user-theme";
import {
  guestThemeKey,
  mergeThemePreferences,
  readThemePreferencesFromStorage,
} from "@/lib/user-theme-storage";
import { useClinicStore } from "@/store/useClinicStore";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const userId = useClinicStore((s) => s.currentUser.id);
  const preferences = useClinicStore((s) => s.userThemePreferences);
  const mergedPreferences = mergeThemePreferences(
    readThemePreferencesFromStorage(),
    preferences
  );

  const onLoginScreen = pathname === "/login" || pathname === "/platform/login";
  const clinicSlug =
    typeof window !== "undefined" ? parseClinicSlugFromHost(window.location.host) : null;
  const accountKey =
    userId || (onLoginScreen && clinicSlug ? guestThemeKey(clinicSlug) : undefined);

  const theme = resolveUserTheme(accountKey, mergedPreferences);

  useEffect(() => {
    applyDocumentTheme(theme);
  }, [theme]);

  return <>{children}</>;
}
