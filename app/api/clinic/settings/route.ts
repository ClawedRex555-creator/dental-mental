import { NextResponse } from "next/server";
import { assertClinicHost } from "@/lib/assert-clinic-host";
import {
  getClinicDataDbWithLegacyStaff,
  saveClinicDataDb,
} from "@/lib/clinic-data-db.server";
import { verifySameOrigin } from "@/lib/csrf-origin";
import { isDatabaseEnabled } from "@/lib/db";
import { getServerSession } from "@/lib/get-server-session";
import { normalizeWeeklySchedule, formatWeeklyScheduleSummary } from "@/lib/clinic-schedule";
import type { ClinicSettings } from "@/lib/types";

function parseClinicSettings(raw: unknown): ClinicSettings | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.name !== "string" || !s.name.trim()) return null;
  if (typeof s.phone !== "string") return null;
  if (typeof s.email !== "string") return null;
  if (typeof s.address !== "string") return null;
  if (typeof s.inn !== "string") return null;

  const weeklySchedule =
    s.weeklySchedule && typeof s.weeklySchedule === "object"
      ? normalizeWeeklySchedule(s.weeklySchedule as ClinicSettings["weeklySchedule"])
      : undefined;
  const workHours =
    typeof s.workHours === "string" && s.workHours.trim()
      ? s.workHours.trim()
      : weeklySchedule
        ? formatWeeklyScheduleSummary(weeklySchedule)
        : "";

  return {
    name: s.name.trim(),
    phone: s.phone.trim(),
    email: s.email.trim(),
    address: s.address.trim(),
    inn: s.inn.trim(),
    ogrn: typeof s.ogrn === "string" && s.ogrn.trim() ? s.ogrn.trim() : undefined,
    ogrnip: typeof s.ogrnip === "string" && s.ogrnip.trim() ? s.ogrnip.trim() : undefined,
    medicalLicense:
      typeof s.medicalLicense === "string" && s.medicalLicense.trim()
        ? s.medicalLicense.trim()
        : undefined,
    medicalLicenseAuthority:
      typeof s.medicalLicenseAuthority === "string" && s.medicalLicenseAuthority.trim()
        ? s.medicalLicenseAuthority.trim()
        : undefined,
    workHours,
    weeklySchedule,
    logo: typeof s.logo === "string" && s.logo.trim() ? s.logo.trim() : undefined,
  };
}

/**
 * Узкий command API: настройки клиники без полного snapshot PUT.
 * Иначе stale вкладка после ack чужого revision затирает название.
 */
export async function POST(request: Request) {
  if (!verifySameOrigin(request)) {
    return NextResponse.json({ error: "Запрос отклонён" }, { status: 403 });
  }
  if (!isDatabaseEnabled()) {
    return NextResponse.json({ error: "База данных не настроена" }, { status: 503 });
  }

  const session = await getServerSession();
  if (!session?.clinicId || session.isSuperAdmin) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }
  const hostDenied = assertClinicHost(session, request);
  if (hostDenied) return hostDenied;
  if (session.role !== "owner" && session.role !== "admin") {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
  }

  const settings = parseClinicSettings(
    body && typeof body === "object" && "clinicSettings" in body
      ? (body as { clinicSettings: unknown }).clinicSettings
      : body
  );
  if (!settings) {
    return NextResponse.json({ error: "Некорректные настройки клиники" }, { status: 400 });
  }

  const existing = await getClinicDataDbWithLegacyStaff(session.clinicId);
  if (!existing) {
    return NextResponse.json({ error: "Снимок клиники не найден" }, { status: 404 });
  }

  const next = {
    ...existing.data,
    clinicSettings: settings,
  };

  const saved = await saveClinicDataDb(session.clinicId, next, {
    replaceAppliedSnapshot: true,
    autoMergeOnVersionConflict: false,
  });

  return NextResponse.json({
    ok: true,
    clinicSettings: settings,
    updatedAt: saved.updatedAt,
    revision: saved.revision,
  });
}
