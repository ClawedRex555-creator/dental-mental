import { DashboardShell } from "@/components/layout/dashboard-shell";
import { AuthGate } from "@/components/auth/auth-gate";
import { StoreHydration } from "@/components/providers/store-hydration";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGate>
      <DashboardShell>
        <StoreHydration>{children}</StoreHydration>
      </DashboardShell>
    </AuthGate>
  );
}
