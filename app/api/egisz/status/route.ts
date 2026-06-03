import { NextResponse } from "next/server";
import { processEgiszQueue } from "@/lib/egisz/worker.server";
import { isDatabaseEnabled } from "@/lib/db";
import { getClinicDataDb } from "@/lib/clinic-data-db.server";
import { getClinicEgiszReadiness, getPlatformEgiszSettings } from "@/lib/egisz/platform.server";
import { getEgiszConfig } from "@/lib/egisz/db.server";
import { resolveClinicIdForSession } from "@/lib/clinic-session.server";
import { getServerSession } from "@/lib/get-server-session";

export async function GET(request: Request) {
  const phiKey = Boolean(process.env.PHI_ENCRYPTION_KEY?.trim());
  const db = isDatabaseEnabled();
  const cronSecret = process.env.EGISZ_CRON_SECRET?.trim();
  const platform = getPlatformEgiszSettings();

  const session = await getServerSession();
  const clinicId = session
    ? await resolveClinicIdForSession(session, request.headers.get("host"))
    : null;

  if (!clinicId) {
    return NextResponse.json({
      ready: db,
      database: db,
      phiEncryption: phiKey,
      cronConfigured: Boolean(cronSecret),
      message: "Откройте настройки из поддомена клиники — у каждого юр. лица свой контур ЕГИСЗ.",
    });
  }

  const [config, snapshot] = await Promise.all([
    getEgiszConfig(clinicId),
    getClinicDataDb(clinicId),
  ]);
  const readiness = getClinicEgiszReadiness(config, {
    name: snapshot?.data.clinicSettings.name,
    inn: snapshot?.data.clinicSettings.inn,
  });

  return NextResponse.json({
    ready: db && config.enabled,
    database: db,
    phiEncryption: phiKey,
    gatewayConfigured: Boolean(readiness.gatewayUrl),
    gatewayUrl: readiness.gatewayUrl,
    n3StubMode: readiness.stubMode,
    connectionMode: readiness.connectionMode,
    signingMode: config.signing?.mode ?? "stub",
    cronConfigured: Boolean(cronSecret),
    mode: config.environment === "production" ? "production" : "test",
    platformSystemId: platform.systemId,
    missingForLive: readiness.missingForLive,
    message: !db
      ? "Требуется PostgreSQL"
      : !config.enabled
        ? "Интеграция отключена для этой клиники"
        : readiness.stubMode
          ? "Stub: CDA и очередь работают без SOAP. Для live заполните N3 credentials этой клиники и переключите режим."
          : "Live: отправка в N3 от имени этой медицинской организации.",
  });
}
