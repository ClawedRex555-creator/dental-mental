import { NextResponse } from "next/server";
import { requireMobileSessionAsync } from "@/lib/mobile-auth-request.server";
import { resolveMobileClinicFromRequest } from "@/lib/mobile-clinic-context.server";
import { isStaffMobileSession } from "@/lib/mobile-staff-auth.server";
import type { MobileClinicContext } from "@/lib/mobile-clinic-context.server";
import type { MobileTokenPayload } from "@/lib/mobile-auth-token";

type StaffContext =
  | { clinic: MobileClinicContext; session: MobileTokenPayload }
  | { error: string; status: number };

export async function resolveStaffMobileRequest(
  request: Request
): Promise<StaffContext> {
  const clinicOrError = await resolveMobileClinicFromRequest(request);
  if ("error" in clinicOrError) {
    return { error: clinicOrError.error, status: clinicOrError.status };
  }

  const session = await requireMobileSessionAsync(request);
  if (!session) {
    return { error: "Требуется авторизация", status: 401 };
  }
  if (session.clinicId !== clinicOrError.clinicId) {
    return { error: "Сессия другой клиники", status: 403 };
  }
  if (!isStaffMobileSession(session)) {
    return { error: "Доступ только для сотрудников клиники", status: 403 };
  }

  return { clinic: clinicOrError, session };
}

export function staffErrorResponse(
  ctx: StaffContext
): NextResponse | null {
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }
  return null;
}

export function isStaffContext(
  ctx: StaffContext
): ctx is { clinic: MobileClinicContext; session: MobileTokenPayload } {
  return !("error" in ctx);
}
