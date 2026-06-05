#!/usr/bin/env node
/**
 * Добавить владельца к уже существующей клинике (если create-clinic остановился на «slug уже есть»).
 *
 *   docker compose exec -T app node scripts/add-clinic-owner.mjs \
 *     --clinic elanar --login admin@elanar.ru --password 'Pass12345' --name 'ФИО'
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
const name = args.name?.trim() || "Владелец клиники";
const url = process.env.DATABASE_URL?.trim();

if (!url || !slug || !login || !password || !name) {
  console.error(
    "Использование: node scripts/add-clinic-owner.mjs --clinic elanar --login email@x.ru --password 'Pass12345' --name 'ФИО'"
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
  const clinicRes = await client.query(`SELECT id, slug, name FROM clinics WHERE slug = $1`, [slug]);
  const clinic = clinicRes.rows[0];
  if (!clinic) {
    console.error(`Клиника "${slug}" не найдена`);
    process.exit(1);
  }

  const ownerRes = await client.query(
    `SELECT id, login FROM auth_users WHERE clinic_id = $1 AND role = 'owner' LIMIT 1`,
    [clinic.id]
  );
  if (ownerRes.rows[0]) {
    console.error(`Владелец уже есть: ${ownerRes.rows[0].login} (${ownerRes.rows[0].id})`);
    console.error("Для смены пароля: node scripts/reset-owner-password.mjs ...");
    process.exit(1);
  }

  const conflict = await client.query(
    `SELECT id FROM auth_users WHERE clinic_id = $1 AND login = $2`,
    [clinic.id, login]
  );
  if (conflict.rows.length > 0) {
    console.error("Этот email уже занят в этой клинике");
    process.exit(1);
  }

  const userId = `auth-owner-${createHash("sha256").update(`${clinic.id}:${login}`).digest("hex").slice(0, 12)}`;
  await client.query(
    `INSERT INTO auth_users (id, clinic_id, login, password_hash, role, name)
     VALUES ($1, $2, $3, $4, 'owner', $5)`,
    [userId, clinic.id, login, hashPassword(password), name]
  );

  const root = process.env.APP_ROOT_DOMAIN ?? "emkaro.ru";
  console.log(`Владелец создан для «${clinic.name}» (${clinic.slug})`);
  console.log(`Логин: ${login}`);
  console.log(`URL: https://${clinic.slug}.${root}/login`);
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await client.end();
}
