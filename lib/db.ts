import "server-only";

import { Pool, type PoolClient } from "pg";

let pool: Pool | null = null;

export function isDatabaseEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function getPool(): Pool | null {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: url,
      max: 10,
      idleTimeoutMillis: 30_000,
    });
  }
  return pool;
}

export async function withDb<T>(fn: (client: PoolClient) => Promise<T>): Promise<T | null> {
  const p = getPool();
  if (!p) return null;
  const client = await p.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function runSchemaMigration(): Promise<void> {
  const p = getPool();
  if (!p) return;
  const fs = await import("fs/promises");
  const path = await import("path");
  const schemaPath = path.join(process.cwd(), "db", "schema.sql");
  const sql = await fs.readFile(schemaPath, "utf8");
  await p.query(sql);
}
