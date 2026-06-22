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
  };

  try {
    const pool = getPool();
    if (!pool) {
      return NextResponse.json({ ok: true, database: false, version, features });
    }
    await pool.query("SELECT 1");
    return NextResponse.json({ ok: true, database: true, version, features });
  } catch {
    return NextResponse.json({ ok: false, version, features }, { status: 503 });
  }
}
