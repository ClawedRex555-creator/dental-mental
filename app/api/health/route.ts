import { readFileSync } from "fs";
import { join } from "path";
import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

function readDeployVersion(): string | undefined {
  const fromEnv = process.env.DEPLOY_VERSION?.trim();
  if (fromEnv) return fromEnv;
  try {
    const raw = readFileSync(join(process.cwd(), ".deploy-version"), "utf8").trim();
    return raw || undefined;
  } catch {
    return undefined;
  }
}

export async function GET() {
  const version = readDeployVersion();
  const features = {
    doctorServicesCatalog: true,
    patientAppointmentSearch: true,
    treatmentPlanQuantity: true,
    treatmentPlansAllDoctors: true,
    clinicCrossDeviceSync: true,
    clinicSyncBaselineFix: true,
    clinicSyncFastPull: true,
    clinicBootstrapBundle: true,
    /** CDA: СНИЛС пациента только цифрами (N3 AddMedRecord) */
    egiszCdaSnilsDigits: true,
    /** CDA и IdDocumentMis — один UUID (требование N3 с 05/2026) */
    egiszDocumentUuidAlign: true,
  };

  try {
    const pool = getPool();
    if (!pool) {
      return NextResponse.json({ ok: true, database: false, version, features });
    }
    await pool.query("SELECT 1");
    return NextResponse.json({ ok: true, database: true, version, features });
  } catch {
    // Liveness: приложение отвечает даже при временной недоступности БД (деплой / restart postgres).
    return NextResponse.json({ ok: false, database: false, version, features });
  }
}
