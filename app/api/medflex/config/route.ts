import { NextResponse } from "next/server";
import { verifySameOrigin } from "@/lib/csrf-origin";
import { resolveClinicIdForSession } from "@/lib/clinic-session.server";
import { getServerSession } from "@/lib/get-server-session";
import { clinicBaseUrl } from "@/lib/clinic-host";
import { listClinics } from "@/lib/clinic-db.server";
import {
  generateMedflexInboundToken,
  getMedflexConfig,
  saveMedflexConfig,
} from "@/lib/medflex/db.server";
import { maskMedflexConfigForClient, parseMedflexConfig } from "@/lib/medflex/types";
import {
  pushMedflexScheduleForClinic,
  pushMedflexServicesForClinic,
} from "@/lib/medflex/push.server";

async function requireClinicAdmin(request: Request) {
  const session = await getServerSession();
  if (!session || session.isSuperAdmin) return null;
  if (session.role !== "owner" && session.role !== "admin") return null;
  const clinicId = await resolveClinicIdForSession(session, request.headers.get("host"));
  if (!clinicId) return null;
  return { session, clinicId };
}

export async function GET(request: Request) {
  const ctx = await requireClinicAdmin(request);
  if (!ctx) return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });

  const config = await getMedflexConfig(ctx.clinicId);
  const clinics = await listClinics();
  const clinic = clinics.find((c) => c.id === ctx.clinicId);
  const base = clinic ? clinicBaseUrl(clinic.slug) : "";

  return NextResponse.json({
    config: maskMedflexConfigForClient(config),
    clinic: { id: ctx.clinicId, slug: clinic?.slug, name: clinic?.name },
    webhookUrls: clinic
      ? {
          booking: `${base}/api/medflex/booking`,
          cancel: `${base}/api/medflex/booking/cancel`,
          status: `${base}/api/medflex/booking/status`,
          update: `${base}/api/medflex/booking/update`,
          health: `${base}/api/medflex/health`,
        }
      : null,
    inboundTokenPreview: config.inboundToken
      ? `${config.inboundToken.slice(0, 8)}…`
      : null,
  });
}

export async function PUT(request: Request) {
  if (!verifySameOrigin(request)) {
    return NextResponse.json({ error: "CSRF" }, { status: 403 });
  }
  const ctx = await requireClinicAdmin(request);
  if (!ctx) return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const incoming = parseMedflexConfig(body);
  const saved = await saveMedflexConfig(ctx.clinicId, {
    ...incoming,
    apiToken: typeof body.apiToken === "string" ? body.apiToken : undefined,
    inboundToken:
      body.regenerateInboundToken === true
        ? generateMedflexInboundToken()
        : typeof body.inboundToken === "string"
          ? body.inboundToken
          : undefined,
  });

  return NextResponse.json({ config: maskMedflexConfigForClient(saved) });
}

export async function POST(request: Request) {
  if (!verifySameOrigin(request)) {
    return NextResponse.json({ error: "CSRF" }, { status: 403 });
  }
  const ctx = await requireClinicAdmin(request);
  if (!ctx) return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { action?: string };
  if (body.action === "push_schedule") {
    const result = await pushMedflexScheduleForClinic(ctx.clinicId);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }
  if (body.action === "push_services") {
    const result = await pushMedflexServicesForClinic(ctx.clinicId);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }
  if (body.action === "reveal_inbound_token") {
    const config = await getMedflexConfig(ctx.clinicId);
    return NextResponse.json({ inboundToken: config.inboundToken ?? null });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
