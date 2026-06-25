import { NextResponse } from "next/server";
import { requireMobileSession } from "@/lib/mobile-auth-request.server";
import { resolveMobileClinicFromRequest } from "@/lib/mobile-clinic-context.server";

export async function GET(request: Request) {
  const clinicOrError = await resolveMobileClinicFromRequest(request);
  if ("error" in clinicOrError) {
    return NextResponse.json({ error: clinicOrError.error }, { status: clinicOrError.status });
  }
  const clinic = clinicOrError;

  const session = requireMobileSession(request);
  if (!session) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }

  if (session.clinicId !== clinic.clinicId) {
    return NextResponse.json({ error: "Сессия другой клиники" }, { status: 403 });
  }

  return NextResponse.json({
    user: {
      id: session.userId,
      name: session.name,
      email: session.email,
      role: session.role,
      kind: session.kind,
      clinicId: session.clinicId,
      clinicSlug: session.clinicSlug,
      patientId: session.patientId,
      staffId: session.staffId,
    },
    clinic: {
      slug: clinic.slug,
      name: clinic.name,
    },
  });
}
