import { DashboardShell } from "@/components/layout/dashboard-shell";
import { SessionSync } from "@/components/auth/session-sync";
import { StoreHydration } from "@/components/providers/store-hydration";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardShell>
      <SessionSync />
      <StoreHydration>{children}</StoreHydration>
    </DashboardShell>
  );
}
