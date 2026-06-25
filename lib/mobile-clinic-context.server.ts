import "server-only";

import { findClinicBySlug } from "@/lib/clinic-db.server";
import { getClinicDataDbWithLegacyStaff } from "@/lib/clinic-data-db.server";
import { parseClinicSlugFromHost } from "@/lib/clinic-host";
import { isDatabaseEnabled } from "@/lib/db";
import { getClinicModulesBySlug } from "@/lib/platform-modules.server";

export interface MobileClinicContext {
  clinicId: string;
  slug: string;
  name: string;
}

export async function resolveMobileClinicFromRequest(
  request: Request
): Promise<MobileClinicContext | { error: string; status: number }> {
  if (!isDatabaseEnabled()) {
    return { error: "База данных не настроена", status: 503 };
  }

  const host = request.headers.get("host");
  const slug = parseClinicSlugFromHost(host);
  if (!slug) {
    return {
      error: "Укажите поддомен клиники (например tstom.emkaro.ru)",
      status: 400,
    };
  }

  const clinic = await findClinicBySlug(slug);
  if (!clinic) {
    return { error: "Клиника не найдена", status: 404 };
  }

  return {
    clinicId: clinic.id,
    slug: clinic.slug,
    name: clinic.name,
  };
}

export async function isMobileModuleEnabled(
  clinicId: string,
  slug: string,
  moduleId: "online_booking" | "patients"
): Promise<boolean> {
  const modules = await getClinicModulesBySlug(slug);
  if (!modules) return moduleId === "online_booking";
  return modules[moduleId] !== false;
}

export async function loadClinicSnapshot(clinicId: string) {
  return getClinicDataDbWithLegacyStaff(clinicId);
}
