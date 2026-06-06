#!/usr/bin/env node
/**
 * Применяет db/schema.sql и/или db/migrations/*.sql к PostgreSQL.
 *
 * Использование:
 *   DATABASE_URL=... node scripts/init-db.mjs              # schema + migrations
 *   DATABASE_URL=... node scripts/init-db.mjs --migrations-only   # только миграции (prod)
 */
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const url = process.env.DATABASE_URL?.trim();
const migrationsOnly = process.argv.includes("--migrations-only");

if (!url) {
  console.error("Задайте DATABASE_URL");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });

/** Разбивает SQL на отдельные команды (node-pg не любит multi-statement query) */
function splitSqlStatements(sql) {
  const lines = sql.split("\n");
  const chunks = [];
  let buf = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("--") || trimmed === "") continue;
    buf += `${line}\n`;
    if (trimmed.endsWith(";")) {
      const stmt = buf.trim();
      if (stmt) chunks.push(stmt);
      buf = "";
    }
  }
  const tail = buf.trim();
  if (tail) chunks.push(tail);
  return chunks;
}

async function ensureMigrationLedger() {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function isMigrationApplied(filename) {
  const res = await client.query(
    "SELECT 1 FROM schema_migrations WHERE filename = $1 LIMIT 1",
    [filename]
  );
  return res.rows.length > 0;
}

async function markMigrationApplied(filename) {
  await client.query(
    "INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING",
    [filename]
  );
}

async function applySqlFile(label, filePath, { skipIfApplied = false } = {}) {
  const filename = path.basename(filePath);
  if (skipIfApplied && (await isMigrationApplied(filename))) {
    console.log(`⊘ ${label} (уже применена)`);
    return;
  }

  const sql = readFileSync(filePath, "utf8");
  const statements = splitSqlStatements(sql);
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    try {
      await client.query(stmt);
    } catch (e) {
      console.error(`Ошибка в ${label}, команда ${i + 1}/${statements.length}:`);
      console.error(stmt.slice(0, 400));
      throw e;
    }
  }

  if (skipIfApplied) {
    await markMigrationApplied(filename);
  }
  console.log(`✓ ${label} (${statements.length} команд)`);
}

try {
  await client.connect();
  await ensureMigrationLedger();

  if (!migrationsOnly) {
    await applySqlFile("schema.sql", path.join(root, "db", "schema.sql"));
  } else {
    console.log("Режим: только миграции (--migrations-only)");
    console.log(
      "На сервере надёжнее: bash scripts/apply-migrations.sh (через psql)"
    );
  }

  const migrationsDir = path.join(root, "db", "migrations");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    await applySqlFile(`migration ${file}`, path.join(migrationsDir, file), {
      skipIfApplied: migrationsOnly,
    });
  }

  console.log("БД инициализирована.");
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await client.end();
}
