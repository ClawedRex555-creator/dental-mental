import { DashboardShell } from "@/components/layout/dashboard-shell";
import { AuthGate } from "@/components/auth/auth-gate";
import { ClinicDataSaveBanner } from "@/components/clinic/clinic-data-save-banner";
import { ClinicDataSync } from "@/components/clinic/clinic-data-sync";
import { ClinicModulesSync } from "@/components/clinic/clinic-modules-sync";
import { ClinicSyncGate } from "@/components/clinic/clinic-sync-gate";
import { WebPushEnabler } from "@/components/notifications/web-push-enabler";
import { StoreHydration } from "@/components/providers/store-hydration";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGate>
      <DashboardShell>
        <StoreHydration>
          <ClinicDataSync />
          <ClinicModulesSync />
          <ClinicDataSaveBanner />
          <WebPushEnabler />
          <ClinicSyncGate>{children}</ClinicSyncGate>
        </StoreHydration>
      </DashboardShell>
    </AuthGate>
  );
}
