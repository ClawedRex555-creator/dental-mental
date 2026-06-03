import { NextResponse } from "next/server";
import { verifySameOrigin } from "@/lib/csrf-origin";
import { resolveClinicIdForSession } from "@/lib/clinic-session.server";
import { getClinicDataDb } from "@/lib/clinic-data-db.server";
import {
  getClinicEgiszReadiness,
  getPlatformEgiszSettings,
  maskEgiszConfigForClient,
} from "@/lib/egisz/platform.server";
import { getEgiszConfig, listEgiszSubmissions, saveEgiszConfig } from "@/lib/egisz/db.server";
import { parseEgiszConfig } from "@/lib/egisz/types";
import { getServerSession } from "@/lib/get-server-session";

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
  if (!ctx) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }
  const [config, submissions, snapshot] = await Promise.all([
    getEgiszConfig(ctx.clinicId),
    listEgiszSubmissions(ctx.clinicId),
    getClinicDataDb(ctx.clinicId),
  ]);
  const clinicSettings = snapshot?.data.clinicSettings;
  const readiness = getClinicEgiszReadiness(config, {
    name: clinicSettings?.name,
    inn: clinicSettings?.inn,
  });

  return NextResponse.json({
    config: maskEgiszConfigForClient(config),
    submissions,
    platform: getPlatformEgiszSettings(),
    clinic: {
      name: clinicSettings?.name ?? "",
      inn: clinicSettings?.inn ?? "",
    },
    readiness,
  });
}

export async function PUT(request: Request) {
  if (!verifySameOrigin(request)) {
    return NextResponse.json({ error: "Запрос отклонён" }, { status: 403 });
  }
  const ctx = await requireClinicAdmin(request);
  if (!ctx) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
  }

  const incoming = parseEgiszConfig(body);
  const saved = await saveEgiszConfig(ctx.clinicId, incoming);
  return NextResponse.json({
    ok: true,
    config: maskEgiszConfigForClient(saved),
  });
}
