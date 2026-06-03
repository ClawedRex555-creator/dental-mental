#!/usr/bin/env node
/**
 * Считает пациентов и связанные сущности в clinic_snapshots.
 *
 *   DATABASE_URL=... node scripts/inspect-clinic-snapshot.mjs
 *   DATABASE_URL=... node scripts/inspect-clinic-snapshot.mjs --slug tstom
 */
import pg from "pg";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if (val && !val.startsWith("--")) {
        out[key] = val;
        i++;
      }
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const slugFilter = args.slug?.trim().toLowerCase();
const url = process.env.DATABASE_URL?.trim();

if (!url) {
  console.error("Задайте DATABASE_URL");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  const res = await client.query(
    `SELECT c.slug, c.name, cs.updated_at, cs.data
     FROM clinic_snapshots cs
     JOIN clinics c ON c.id = cs.clinic_id
     ${slugFilter ? "WHERE LOWER(c.slug) = $1" : ""}
     ORDER BY c.slug`,
    slugFilter ? [slugFilter] : []
  );

  if (!res.rows.length) {
    console.log(slugFilter ? `Клиника slug=${slugFilter} не найдена` : "Нет снимков в clinic_snapshots");
    process.exit(0);
  }

  for (const row of res.rows) {
    const data = row.data ?? {};
    const patients = Array.isArray(data.patients) ? data.patients : [];
    const appointments = Array.isArray(data.appointments) ? data.appointments : [];
    const doctors = Array.isArray(data.doctors) ? data.doctors : [];
    const services = Array.isArray(data.services) ? data.services : [];
    const patientIds = new Set(patients.map((p) => p?.id).filter(Boolean));
    const orphanAppts = appointments.filter((a) => a?.patientId && !patientIds.has(a.patientId));

    console.log("—".repeat(60));
    console.log(`${row.name} (${row.slug})`);
    console.log(`  updated_at: ${row.updated_at?.toISOString?.() ?? row.updated_at}`);
    console.log(`  patients:     ${patients.length}`);
    console.log(`  appointments: ${appointments.length} (без пациента в списке: ${orphanAppts.length})`);
    console.log(`  doctors:      ${doctors.length}`);
    console.log(`  services:     ${services.length}`);
    if (patients.length > 0 && patients.length <= 5) {
      console.log(
        "  sample:",
        patients.map((p) => `${p.lastName ?? ""} ${p.firstName ?? ""}`.trim() || p.id).join("; ")
      );
    }
  }
} finally {
  await client.end();
}
