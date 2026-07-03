import { NextResponse } from "next/server";
import { getMobileStaffEarnings } from "@/lib/mobile-staff.server";
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
  const earnings = await getMobileStaffEarnings(
    ctx.clinic.clinicId,
    ctx.session,
    {
      from: searchParams.get("from"),
      to: searchParams.get("to"),
    }
  );

  if (!earnings) {
    return NextResponse.json(
      { error: "Заработок доступен только врачам клиники" },
      { status: 404 }
    );
  }

  return NextResponse.json({ earnings });
}
