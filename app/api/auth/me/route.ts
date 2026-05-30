import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_COOKIE, verifySessionToken } from "@/lib/auth-session";
import { parseClinicSlugFromHost } from "@/lib/clinic-host";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(AUTH_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const host = request.headers.get("host");
  const clinicSlug = parseClinicSlugFromHost(host);
  if (
    session.clinicSlug &&
    clinicSlug &&
    session.clinicSlug !== clinicSlug
  ) {
    return NextResponse.json({ error: "Сессия другой клиники" }, { status: 403 });
  }

  return NextResponse.json({
    user: {
      id: session.userId,
      name: session.name,
      email: session.email,
      role: session.role,
      staffId: session.staffId,
      clinicId: session.clinicId,
      clinicSlug: session.clinicSlug,
      status: "active" as const,
    },
  });
}
