#!/usr/bin/env node
/** Включает settings=true и нормализует modules для всех клиник (или одной по --slug) */
import pg from "pg";

const url = process.env.DATABASE_URL?.trim();
const slug = process.argv.find((a) => a.startsWith("--slug="))?.slice(7)?.toLowerCase();

if (!url) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

const where = slug ? "WHERE slug = $1" : "";
const params = slug ? [slug] : [];

const res = await client.query(
  `SELECT id, slug, modules FROM clinics ${where}`,
  params
);

for (const row of res.rows) {
  const m = row.modules && typeof row.modules === "object" ? { ...row.modules } : {};
  m.settings = true;
  await client.query(`UPDATE clinics SET modules = $2::jsonb WHERE id = $1`, [
    row.id,
    JSON.stringify(m),
  ]);
  console.log(`OK ${row.slug}: settings=true`);
}

await client.end();
