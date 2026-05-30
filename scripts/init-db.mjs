#!/usr/bin/env node
/**
 * Применяет db/schema.sql к PostgreSQL.
 * Использование: DATABASE_URL=postgresql://... npm run db:init
 */
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const url = process.env.DATABASE_URL?.trim();

if (!url) {
  console.error("Задайте DATABASE_URL");
  process.exit(1);
}

const sql = readFileSync(path.join(__dirname, "..", "db", "schema.sql"), "utf8");
const client = new pg.Client({ connectionString: url });

try {
  await client.connect();
  await client.query(sql);
  console.log("Схема БД применена.");
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await client.end();
}
