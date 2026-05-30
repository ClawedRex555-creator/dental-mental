"use client";

import { Moon, Sun } from "lucide-react";
import type { ThemeMode } from "@/lib/types";
import { resolveUserTheme } from "@/lib/user-theme";
import { cn } from "@/lib/utils";
import { useClinicStore } from "@/store/useClinicStore";
import { Button } from "@/components/ui/button";

interface ThemeToggleProps {
  className?: string;
  /** Показать подписи «Светлая» / «Тёмная» */
  showLabels?: boolean;
  size?: "sm" | "default";
}

export function ThemeToggle({ className, showLabels = false, size = "default" }: ThemeToggleProps) {
  const userId = useClinicStore((s) => s.currentUser.id);
  const preferences = useClinicStore((s) => s.userThemePreferences);
  const legacyClinicTheme = useClinicStore((s) => s.clinicSettings.theme);
  const setUserTheme = useClinicStore((s) => s.setUserTheme);
  const theme = resolveUserTheme(userId, preferences, legacyClinicTheme);

  const apply = (mode: ThemeMode) => {
    if (!userId) return;
    setUserTheme(mode);
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
            disabled={!userId}
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
