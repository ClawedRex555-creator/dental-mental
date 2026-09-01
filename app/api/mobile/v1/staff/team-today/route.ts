import { NextResponse } from "next/server";
import { getMobileStaffTeamToday } from "@/lib/mobile-staff.server";
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

  const team = await getMobileStaffTeamToday(
    ctx.clinic.clinicId,
    ctx.clinic.name,
    ctx.session
  );
  if (team == null) {
    return NextResponse.json(
      { error: "Сводка команды доступна только владельцу и администратору" },
      { status: 403 }
    );
  }

  return NextResponse.json({ team, date: new Date().toISOString().slice(0, 10) });
}
