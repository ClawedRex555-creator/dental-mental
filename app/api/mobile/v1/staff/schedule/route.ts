import { NextResponse } from "next/server";
import { getMobileStaffSchedule } from "@/lib/mobile-staff.server";
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
  const month =
    searchParams.get("month") ??
    new Date().toISOString().slice(0, 7);

  try {
    const schedule = await getMobileStaffSchedule(
      ctx.clinic.clinicId,
      ctx.session,
      month
    );
    if (!schedule) {
      return NextResponse.json(
        { error: "График доступен только врачам клиники" },
        { status: 404 }
      );
    }
    return NextResponse.json({ schedule });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Не удалось загрузить график";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
