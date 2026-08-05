import { NextResponse } from "next/server";
import { listMobileStaffPatients } from "@/lib/mobile-staff-clinic.server";
import {
  isStaffContext,
  resolveStaffMobileRequest,
  staffErrorResponse,
} from "@/lib/mobile-staff-route.server";

export async function GET(request: Request) {
  const ctx = await resolveStaffMobileRequest(request);
  const err = staffErrorResponse(ctx);
  if (err) return err;
  if (!isStaffContext(ctx)) {
    return NextResponse.json({ error: "Ошибка авторизации" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const patients = await listMobileStaffPatients(ctx.clinic.clinicId, ctx.session, {
    query: searchParams.get("q"),
  });

  return NextResponse.json({ patients });
}
