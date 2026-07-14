import { getAppRootDomain } from "@/lib/clinic-host";
import { listClinics } from "@/lib/clinic-db.server";
import { isDatabaseEnabled } from "@/lib/db";
import { PlatformLandingPage } from "@/components/marketing/platform-landing-page";

export const dynamic = "force-dynamic";

export default async function PlatformHomePage() {
  const rootDomain = getAppRootDomain();
  const databaseEnabled = isDatabaseEnabled();
  const clinics = databaseEnabled ? await listClinics() : [];
  return (
    <PlatformLandingPage
      rootDomain={rootDomain}
      clinics={clinics}
      databaseEnabled={databaseEnabled}
    />
  );
}
