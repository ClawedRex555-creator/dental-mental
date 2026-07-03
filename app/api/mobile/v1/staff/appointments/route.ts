import { NextResponse } from "next/server";
import { getMobileStaffAppointments } from "@/lib/mobile-staff.server";
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
  const appointments = await getMobileStaffAppointments(
    ctx.clinic.clinicId,
    ctx.clinic.name,
    ctx.session,
    {
      from: searchParams.get("from"),
      to: searchParams.get("to"),
      doctorId: searchParams.get("doctorId"),
    }
  );

  return NextResponse.json({ appointments });
}
