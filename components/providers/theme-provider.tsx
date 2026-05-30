"use client";

import { useEffect } from "react";
import { resolveUserTheme } from "@/lib/user-theme";
import { useClinicStore } from "@/store/useClinicStore";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const userId = useClinicStore((s) => s.currentUser.id);
  const preferences = useClinicStore((s) => s.userThemePreferences);
  const legacyClinicTheme = useClinicStore((s) => s.clinicSettings.theme);
  const theme = resolveUserTheme(userId, preferences, legacyClinicTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return <>{children}</>;
}
