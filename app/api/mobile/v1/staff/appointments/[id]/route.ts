import { NextResponse } from "next/server";
import { updateMobileStaffAppointmentStatus } from "@/lib/mobile-staff-clinic.server";
import {
  isStaffContext,
  resolveStaffMobileRequest,
  staffErrorResponse,
} from "@/lib/mobile-staff-route.server";
import type { AppointmentStatus } from "@/lib/types";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const ctx = await resolveStaffMobileRequest(request);
  const err = staffErrorResponse(ctx);
  if (err) return err;
  if (!isStaffContext(ctx)) {
    return NextResponse.json({ error: "Ошибка авторизации" }, { status: 401 });
  }

  const { id } = await context.params;
  let body: { status?: string; notes?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
  }

  if (!body.status) {
    return NextResponse.json({ error: "Укажите status" }, { status: 400 });
  }

  try {
    const result = await updateMobileStaffAppointmentStatus(
      ctx.clinic.clinicId,
      ctx.session,
      id,
      body.status as AppointmentStatus,
      body.notes
    );
    if (!result) {
      return NextResponse.json({ error: "Приём не найден" }, { status: 404 });
    }
    return NextResponse.json({ appointment: result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Не удалось обновить статус";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
