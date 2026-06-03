import { NextResponse } from "next/server";
import { findClinicBySlug } from "@/lib/clinic-db.server";
import { parseClinicSlugFromHost } from "@/lib/clinic-host";
import { getServerSession } from "@/lib/get-server-session";
import {
  getClinicModules,
  getClinicModulesBySlug,
} from "@/lib/platform-modules.server";
import { defaultClinicModules } from "@/lib/modules";
import { isDatabaseEnabled } from "@/lib/db";

export async function GET(request: Request) {
  if (!isDatabaseEnabled()) {
    return NextResponse.json({ modules: defaultClinicModules(), database: false });
  }

  const session = await getServerSession();
  let clinicId = session?.clinicId;

  if (!clinicId && session?.clinicSlug) {
    const clinic = await findClinicBySlug(session.clinicSlug);
    clinicId = clinic?.id;
  }

  if (!clinicId) {
    const slug = parseClinicSlugFromHost(request.headers.get("host"));
    if (slug) {
      const modules = await getClinicModulesBySlug(slug);
      if (modules) {
        return NextResponse.json({ modules, database: true });
      }
    }
    return NextResponse.json({ modules: defaultClinicModules(), database: false });
  }

  const modules = await getClinicModules(clinicId);
  return NextResponse.json({ modules, database: true });
}
