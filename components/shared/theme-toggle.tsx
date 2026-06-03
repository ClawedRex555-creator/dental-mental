"use client";

import { Moon, Sun } from "lucide-react";
import type { ThemeMode } from "@/lib/types";
import { applyDocumentTheme, resolveUserTheme } from "@/lib/user-theme";
import {
  guestThemeKey,
  mergeThemePreferences,
  readThemePreferencesFromStorage,
} from "@/lib/user-theme-storage";
import { cn } from "@/lib/utils";
import { useClinicStore } from "@/store/useClinicStore";
import { Button } from "@/components/ui/button";

interface ThemeToggleProps {
  className?: string;
  /** Показать подписи «Светлая» / «Тёмная» */
  showLabels?: boolean;
  size?: "sm" | "default";
  /** На экране входа — тема до логина по поддомену клиники */
  guestScope?: string;
}

export function ThemeToggle({
  className,
  showLabels = false,
  size = "default",
  guestScope,
}: ThemeToggleProps) {
  const userId = useClinicStore((s) => s.currentUser.id);
  const preferences = useClinicStore((s) => s.userThemePreferences);
  const setThemePreference = useClinicStore((s) => s.setThemePreference);
  const setUserTheme = useClinicStore((s) => s.setUserTheme);
  const mergedPreferences = mergeThemePreferences(
    readThemePreferencesFromStorage(),
    preferences
  );

  const accountKey = userId || (guestScope ? guestThemeKey(guestScope) : "");
  const theme = resolveUserTheme(accountKey || undefined, mergedPreferences);

  const apply = (mode: ThemeMode) => {
    if (!accountKey) return;
    if (userId) {
      setUserTheme(mode);
    } else {
      setThemePreference(accountKey, mode);
    }
    applyDocumentTheme(mode);
  };

  const btnSize = size === "sm" ? "sm" : "default";

  return (
    <div className={cn("flex gap-2", className)}>
      {(["light", "dark"] as ThemeMode[]).map((mode) => {
        const active = theme === mode;
        const Icon = mode === "light" ? Sun : Moon;
        return (
          <Button
            key={mode}
            type="button"
            size={btnSize}
            variant={active ? "default" : "outline"}
            onClick={() => apply(mode)}
            disabled={!accountKey}
            title={mode === "light" ? "Светлая тема" : "Тёмная тема"}
            className="gap-2"
          >
            <Icon className="h-4 w-4" />
            {showLabels && (mode === "light" ? "Светлая" : "Тёмная")}
          </Button>
        );
      })}
    </div>
  );
}
