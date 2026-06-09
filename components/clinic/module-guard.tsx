"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  isModuleEnabled,
  type SystemModuleId,
  type ClinicModules,
} from "@/lib/modules";
import { isAccountSettingsPath } from "@/lib/rbac";
import { isPathBlockedByModules, resolveSafeRedirectPath } from "@/lib/modules-rbac";
import { useClinicStore } from "@/store/useClinicStore";

export function useEnabledModules(): ClinicModules {
  return useClinicStore((s) => s.enabledModules);
}

export function useIsModuleEnabled(moduleId: SystemModuleId): boolean {
  const modules = useEnabledModules();
  return isModuleEnabled(modules, moduleId);
}

/** Блокирует отключённые разделы; /settings и /profile всегда доступны */
export function ModuleGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const modules = useEnabledModules();
  const role = useClinicStore((s) => s.currentRole);
  const lastRedirect = useRef<string | null>(null);

  const blocked = isPathBlockedByModules(pathname, modules, role);

  useEffect(() => {
    if (!blocked) {
      lastRedirect.current = null;
      return;
    }
    const target = resolveSafeRedirectPath(role, modules, pathname);
    const pathOnly = pathname.split("?")[0];
    if (target === pathOnly) return;
    if (lastRedirect.current === target) return;
    lastRedirect.current = target;
    router.replace(target);
  }, [blocked, role, modules, router, pathname]);

  if (isAccountSettingsPath(pathname)) {
    return <>{children}</>;
  }

  if (blocked) return null;
  return <>{children}</>;
}

/** Условный блок по модулю (настройки, модалки без отдельного URL) */
export function ModuleGate({
  module,
  children,
  fallback = null,
}: {
  module: SystemModuleId;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const enabled = useIsModuleEnabled(module);
  if (!enabled) return <>{fallback}</>;
  return <>{children}</>;
}
