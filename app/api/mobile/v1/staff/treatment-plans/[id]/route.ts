import { NextResponse } from "next/server";
import { getMobileStaffTreatmentPlan } from "@/lib/mobile-staff-clinic.server";
import {
  isStaffContext,
  resolveStaffMobileRequest,
  staffErrorResponse,
} from "@/lib/mobile-staff-route.server";

export async function GET(
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
  const plan = await getMobileStaffTreatmentPlan(
    ctx.clinic.clinicId,
    ctx.session,
    id
  );
  if (!plan) {
    return NextResponse.json({ error: "План не найден" }, { status: 404 });
  }

  return NextResponse.json({ plan });
}
