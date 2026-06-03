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

async function applySqlFile(label, filePath) {
  const sql = readFileSync(filePath, "utf8");
  const statements = splitSqlStatements(sql);
  for (const stmt of statements) {
    await client.query(stmt);
  }
  console.log(`✓ ${label} (${statements.length} команд)`);
}

try {
  await client.connect();

  if (!migrationsOnly) {
    await applySqlFile("schema.sql", path.join(root, "db", "schema.sql"));
  } else {
    console.log("Режим: только миграции (--migrations-only)");
  }

  const migrationsDir = path.join(root, "db", "migrations");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    await applySqlFile(`migration ${file}`, path.join(migrationsDir, file));
  }

  console.log("БД инициализирована.");
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await client.end();
}
