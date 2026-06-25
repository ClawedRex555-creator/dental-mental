import { NextResponse } from "next/server";
import { getMobileCatalog } from "@/lib/mobile-catalog.server";
import {
  isMobileModuleEnabled,
  resolveMobileClinicFromRequest,
} from "@/lib/mobile-clinic-context.server";

/** Публичный каталог врачей и услуг клиники (для Tstom до входа) */
export async function GET(request: Request) {
  const clinicOrError = await resolveMobileClinicFromRequest(request);
  if ("error" in clinicOrError) {
    return NextResponse.json({ error: clinicOrError.error }, { status: clinicOrError.status });
  }
  const clinic = clinicOrError;

  const catalog = await getMobileCatalog(clinic.clinicId);
  const onlineBookingEnabled = await isMobileModuleEnabled(
    clinic.clinicId,
    clinic.slug,
    "online_booking"
  );

  return NextResponse.json({
    clinic: {
      slug: clinic.slug,
      name: clinic.name,
    },
    onlineBookingEnabled,
    ...catalog,
  });
}
