import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ClinicRecord } from "@/lib/clinic-db.server";
import { EmkaroMarketingSite } from "@/components/marketing/emkaro-marketing-site";

interface PlatformLandingPageProps {
  rootDomain: string;
  clinics: ClinicRecord[];
  databaseEnabled: boolean;
}

function readLandingHtml() {
  return readFileSync(
    join(process.cwd(), "components/marketing/emkaro-landing-body.html"),
    "utf8"
  );
}

export function PlatformLandingPage({
  rootDomain,
  clinics,
  databaseEnabled,
}: PlatformLandingPageProps) {
  return (
    <EmkaroMarketingSite
      html={readLandingHtml()}
      rootDomain={rootDomain}
      clinics={clinics}
      databaseEnabled={databaseEnabled}
    />
  );
}
