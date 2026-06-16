"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import {
  BarChart3,
  Calendar,
  ClipboardList,
  FileText,
  Globe,
  LayoutDashboard,
  Menu,
  Package,
  Settings,
  UserCog,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { AppLogo } from "@/components/brand/app-logo";
import { APP_NAME, NAV_ITEMS, ROLE_LABELS } from "@/lib/constants";
import { navItemsForRole } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { clearPersistedClinicData } from "@/lib/clinic-storage-client";
import { notifySessionChanged } from "@/lib/session-sync.client";
import { useClinicStore } from "@/store/useClinicStore";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Button } from "@/components/ui/button";

const ICON_MAP = {
  LayoutDashboard,
  Calendar,
  Users,
  FileText,
  ClipboardList,
  Wallet,
  Package,
  BarChart3,
  UserCog,
  Globe,
  Settings,
} as const;

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    currentUser,
    clinicSettings,
    sidebarOpen,
    toggleSidebar,
    setSidebarOpen,
    clearSession,
    enabledModules,
  } = useClinicStore();
  const currentRole = currentUser.role;
  const [sidebarHover, setSidebarHover] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  let navItems = navItemsForRole(currentRole, enabledModules);

  // Врач: планы лечения и прайс всегда в меню (даже при отключённых модулях)
  if (currentRole === "doctor") {
    const plansNav = NAV_ITEMS.find((item) => item.href === "/treatment-plans");
    if (plansNav && !navItems.some((item) => item.href === "/treatment-plans")) {
      const afterRecords = navItems.findIndex((item) => item.href === "/medical-records");
      const insertAt = afterRecords >= 0 ? afterRecords + 1 : navItems.length;
      navItems = [
        ...navItems.slice(0, insertAt),
        plansNav,
        ...navItems.slice(insertAt),
      ];
    }
    const servicesNav = NAV_ITEMS.find((item) => item.href === "/warehouse");
    if (servicesNav && !navItems.some((item) => item.href === "/warehouse")) {
      const afterPlans = navItems.findIndex((item) => item.href === "/treatment-plans");
      const insertAt = afterPlans >= 0 ? afterPlans + 1 : navItems.length;
      navItems = [
        ...navItems.slice(0, insertAt),
        servicesNav,
        ...navItems.slice(insertAt),
      ];
    }
  }

  const settingsNav = NAV_ITEMS.find((item) => item.href === "/settings");
  const navWithSettings =
    settingsNav &&
    settingsNav.roles.includes(currentRole) &&
    !navItems.some((item) => item.href === "/settings")
      ? [...navItems, settingsNav]
      : navItems;
  const sidebarExpanded = sidebarHover || (isMobile && sidebarOpen);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [pathname, isMobile, setSidebarOpen]);

  return (
    <div className="flex min-h-screen bg-[var(--background)]">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-[var(--border)] bg-[var(--card)] lg:static",
          "transition-[width] duration-300 ease-in-out",
          sidebarExpanded
            ? "w-64 translate-x-0"
            : "-translate-x-full w-64 lg:w-[4.5rem] lg:translate-x-0"
        )}
        onMouseEnter={() => setSidebarHover(true)}
        onMouseLeave={() => setSidebarHover(false)}
      >
        <div className="flex h-16 items-center justify-between border-b border-[var(--border)] px-4">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-teal-600">
            <AppLogo size={32} className="h-8 w-8 rounded-lg" />
            <span
              className={cn(
                "truncate text-sm transition-all duration-300 ease-in-out",
                sidebarExpanded ? "max-w-[10rem] opacity-100" : "max-w-0 opacity-0"
              )}
            >
              {APP_NAME}
            </span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {navWithSettings.map((item) => {
            const Icon = ICON_MAP[item.icon as keyof typeof ICON_MAP];
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch
                title={!sidebarExpanded ? item.label : undefined}
                onClick={() => {
                  if (isMobile) setSidebarOpen(false);
                }}
                className={cn(
                  "nav-sidebar-link flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active ? "nav-sidebar-link-active" : "text-[var(--muted)]"
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span
                  className={cn(
                    "whitespace-nowrap transition-all duration-300 ease-in-out",
                    sidebarExpanded ? "max-w-[12rem] opacity-100" : "max-w-0 opacity-0"
                  )}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>
        <div
          className={cn(
            "border-t border-[var(--border)] p-4 text-xs text-[var(--muted)] transition-opacity duration-300 ease-in-out",
            sidebarExpanded ? "opacity-100" : "pointer-events-none opacity-0 lg:h-0 lg:overflow-hidden lg:p-0"
          )}
        >
          <p className="font-medium text-[var(--foreground)]">{clinicSettings.name}</p>
          <p className="mt-1">{clinicSettings.phone}</p>
        </div>
      </aside>

      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          role="presentation"
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-0">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[var(--border)] bg-[var(--card)] px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={toggleSidebar}>
              <Menu className="h-5 w-5" />
            </Button>
            <div className="hidden sm:block">
              <p className="text-sm font-medium text-[var(--foreground)]">{currentUser.name}</p>
              <p className="text-xs text-[var(--muted)]">{ROLE_LABELS[currentRole]}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
          <ThemeToggle size="sm" />
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
              clearSession();
              clearPersistedClinicData();
              notifySessionChanged("logout");
              router.push("/login");
              router.refresh();
            }}
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Выйти</span>
          </Button>
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
