#!/usr/bin/env node
/**
 * Создание или сброс пароля супер-администратора платформы.
 * Использование:
 *   DATABASE_URL=... node scripts/create-superadmin.mjs login password [имя]
 */
import { createHash, randomBytes, scryptSync } from "crypto";
import pg from "pg";

const url = process.env.DATABASE_URL?.trim();
const login = process.argv[2]?.trim().toLowerCase();
const password = process.argv[3];
const name = process.argv[4]?.trim() || "Супер-администратор";

if (!url || !login || !password) {
  console.error("Использование: DATABASE_URL=... node scripts/create-superadmin.mjs login password [имя]");
  process.exit(1);
}

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function hashPassword(pwd) {
  const salt = randomBytes(16);
  const hash = scryptSync(pwd, salt, 64, SCRYPT_PARAMS);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

const id = `pa_${createHash("sha256").update(login).digest("hex").slice(0, 12)}`;
const hash = hashPassword(password);
const client = new pg.Client({ connectionString: url });

try {
  await client.connect();
  await client.query(
    `INSERT INTO platform_admins (id, login, password_hash, name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (login) DO UPDATE
     SET password_hash = EXCLUDED.password_hash, name = EXCLUDED.name, active = TRUE`,
    [id, login, hash, name]
  );
  console.log(`Супер-администратор «${login}» готов. Вход: /platform/login`);
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await client.end();
}
