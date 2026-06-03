#!/usr/bin/env node
/**
 * Создать или сбросить пароль сотрудника (вход в клинику).
 * Использование:
 *   docker compose exec app node scripts/reset-staff-password.mjs \
 *     --clinic tstom --login doctor@clinic.ru --password 'Pass123456!' \
 *     --staff-id doc-abc123 --name "Иван Иванов" --role doctor
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
const staffId = args["staff-id"]?.trim();
const name = args.name?.trim();
const role = args.role?.trim() ?? "doctor";
const url = process.env.DATABASE_URL?.trim();

if (!url || !slug || !login || !password || !staffId || !name) {
  console.error(
    "Использование: node scripts/reset-staff-password.mjs --clinic tstom --login email@x.ru --password 'Pass12345' --staff-id doc-xxx --name 'ФИО' [--role doctor]"
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

  const id = `auth-${staffId}`;
  const hash = hashPassword(password);

  await client.query(
    `DELETE FROM auth_users WHERE clinic_id = $1 AND (login = $2 OR id = $3 OR staff_id = $4)`,
    [clinicId, login, id, staffId]
  );
  await client.query(
    `INSERT INTO auth_users (id, clinic_id, login, password_hash, role, name, staff_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, clinicId, login, hash, role, name, staffId]
  );

  console.log(`Готово. Вход: https://${slug}.emkaro.ru/login`);
  console.log(`Логин: ${login}`);
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await client.end();
}
