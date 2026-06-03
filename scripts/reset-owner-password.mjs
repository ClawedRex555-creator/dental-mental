#!/usr/bin/env node
/**
 * Сброс логина/пароля/имени владельца клиники (production).
 *
 *   docker compose exec app node scripts/reset-owner-password.mjs \
 *     --clinic tstom \
 *     --login makarovds@yandex.ru \
 *     --password 'StrongPass123!' \
 *     --name 'София Макарова'
 */
import { createHash, randomBytes, scryptSync } from "crypto";
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

function hashPassword(raw) {
  const salt = randomBytes(16);
  const hash = scryptSync(raw, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

const args = parseArgs(process.argv.slice(2));
const slug = args.clinic?.trim().toLowerCase();
const login = args.login?.trim().toLowerCase();
const password = args.password ?? "";
const name = args.name?.trim();
const url = process.env.DATABASE_URL?.trim();

if (!url || !slug || !login || !password || !name) {
  console.error(
    "Использование: node scripts/reset-owner-password.mjs --clinic tstom --login email@x.ru --password 'Pass12345' --name 'ФИО'"
  );
  process.exit(1);
}
if (password.length < 8) {
  console.error("Пароль не менее 8 символов");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });

try {
  await client.connect();
  const clinicRes = await client.query(`SELECT id FROM clinics WHERE slug = $1`, [slug]);
  const clinicId = clinicRes.rows[0]?.id;
  if (!clinicId) {
    console.error(`Клиника "${slug}" не найдена`);
    process.exit(1);
  }

  const ownerRes = await client.query(
    `SELECT id FROM auth_users WHERE clinic_id = $1 AND role = 'owner' LIMIT 1`,
    [clinicId]
  );
  const ownerId = ownerRes.rows[0]?.id;
  if (!ownerId) {
    console.error("Владелец (role=owner) не найден в auth_users");
    process.exit(1);
  }

  const conflict = await client.query(
    `SELECT id FROM auth_users WHERE clinic_id = $1 AND login = $2 AND id <> $3`,
    [clinicId, login, ownerId]
  );
  if (conflict.rows.length > 0) {
    console.error("Этот email уже занят другим пользователем");
    process.exit(1);
  }

  const hash = hashPassword(password);
  await client.query(
    `UPDATE auth_users SET login = $1, password_hash = $2, name = $3
     WHERE clinic_id = $4 AND id = $5`,
    [login, hash, name, clinicId, ownerId]
  );

  console.log(`Готово. Вход: https://${slug}.emkaro.ru/login`);
  console.log(`Логин: ${login}`);
  console.log(`Имя в интерфейсе: ${name}`);
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await client.end();
}
