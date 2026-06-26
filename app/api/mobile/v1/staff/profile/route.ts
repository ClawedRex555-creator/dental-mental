import { NextResponse } from "next/server";
import { getMobileStaffProfile } from "@/lib/mobile-staff.server";
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

  const profile = await getMobileStaffProfile(
    ctx.clinic.clinicId,
    ctx.session,
    ctx.clinic.name
  );
  if (!profile) {
    return NextResponse.json(
      { error: "Профиль врача не найден для этой учётной записи" },
      { status: 404 }
    );
  }

  return NextResponse.json({ profile, clinic: ctx.clinic });
}
