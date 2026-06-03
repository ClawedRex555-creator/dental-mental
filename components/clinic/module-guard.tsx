"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { resolvePathModule, isModuleEnabled } from "@/lib/modules";
import { defaultPathForRole } from "@/lib/rbac";
import { useClinicStore } from "@/store/useClinicStore";

/** Перенаправляет, если модуль раздела отключён супер-админом */
export function ModuleGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const modules = useClinicStore((s) => s.enabledModules);
  const role = useClinicStore((s) => s.currentRole);

  useEffect(() => {
    const moduleId = resolvePathModule(pathname);
    if (!moduleId) return;
    if (!isModuleEnabled(modules, moduleId)) {
      router.replace(defaultPathForRole(role, modules));
    }
  }, [pathname, modules, role, router]);

  return <>{children}</>;
}
