import "server-only";

import { NextResponse } from "next/server";
import { resolveClinicIdForSession } from "@/lib/clinic-session.server";
import { getServerSession } from "@/lib/get-server-session";
import { assertClinicModule } from "@/lib/module-access.server";

export async function requireNotificationsAdmin(request: Request) {
  const session = await getServerSession();
  if (!session || session.isSuperAdmin) return null;
  if (session.role !== "owner" && session.role !== "admin" && session.role !== "doctor") {
    return null;
  }
  const clinicId = await resolveClinicIdForSession(session, request.headers.get("host"));
  if (!clinicId) return null;
  const denied = await assertClinicModule(clinicId, "notifications");
  if (denied) return { denied, clinicId: null as never, session: null as never };
  return { session, clinicId, denied: null as never };
}

export function notificationsForbidden(): NextResponse {
  return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
}
