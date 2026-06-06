#!/usr/bin/env node
/**
 * Создаёт клинику и первого владельца.
 *
 * npm run create-clinic -- --slug ulybka --name "Стоматология Улыбка" \
 *   --email owner@ulybka.ru --password 'StrongPass123' --owner-name "Владелец"
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
const slug = args.slug?.trim().toLowerCase();
const name = args.name?.trim();
const email = args.email?.trim().toLowerCase();
const password = args.password ?? "";
const ownerName = args["owner-name"]?.trim() || "Владелец клиники";
const url = process.env.DATABASE_URL?.trim();

if (!url) {
  console.error("Задайте DATABASE_URL");
  process.exit(1);
}
if (!slug || !name || !email || !password) {
  console.error(
    "Использование: npm run create-clinic -- --slug ulybka --name \"Клиника\" --email owner@x.ru --password 'Pass12345'"
  );
  process.exit(1);
}
if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)) {
  console.error("slug: только a-z, 0-9 и дефис");
  process.exit(1);
}
if (password.length < 8) {
  console.error("Пароль не менее 8 символов");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });

try {
  await client.connect();

  const exists = await client.query(`SELECT id FROM clinics WHERE slug = $1`, [slug]);
  if (exists.rowCount > 0) {
    console.error(`Клиника с slug "${slug}" уже существует`);
    process.exit(1);
  }

  const clinicRes = await client.query(
    `INSERT INTO clinics (slug, name) VALUES ($1, $2) RETURNING id, slug, name`,
    [slug, name]
  );
  const clinic = clinicRes.rows[0];

  const taken = await client.query(
    `SELECT c.slug FROM auth_users u
     JOIN clinics c ON c.id = u.clinic_id
     WHERE u.login = $1 LIMIT 1`,
    [email]
  );
  if (taken.rows[0]) {
    console.error(
      `Этот email уже зарегистрирован в системе (клиника «${taken.rows[0].slug}»)`
    );
    process.exit(1);
  }

  const userId = `auth-owner-${createHash("sha256").update(`${clinic.id}:${email}`).digest("hex").slice(0, 12)}`;

  await client.query(
    `INSERT INTO auth_users (id, clinic_id, login, password_hash, role, name)
     VALUES ($1, $2, $3, $4, 'owner', $5)`,
    [userId, clinic.id, email, hashPassword(password), ownerName]
  );

  const emptySnapshot = {
    doctors: [],
    services: [],
    cabinets: [],
    patients: [],
    appointments: [],
    medicalRecords: [],
    treatmentPlans: [],
    payments: [],
    invoices: [],
    workActs: [],
    actCounter: 1,
    warehouse: [],
    tasks: [],
    onlineBookings: [],
    patientFiles: [],
    patientNotes: [],
    teethByPatient: {},
    clinicSettings: {
      name,
      weeklySchedule: [],
    },
    documentTemplates: [],
    clinicExpenses: [],
    legalDocuments: [],
    doctorSchedules: [],
    prepayments: [],
    userThemePreferences: {},
    _schemaVersion: 1,
  };

  await client.query(
    `INSERT INTO clinic_snapshots (clinic_id, data, version, updated_at)
     VALUES ($1, $2::jsonb, 1, NOW())
     ON CONFLICT (clinic_id) DO NOTHING`,
    [clinic.id, JSON.stringify(emptySnapshot)]
  );

  const root = process.env.APP_ROOT_DOMAIN ?? "localhost";
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  const loginUrl =
    root === "localhost"
      ? `${protocol}://${slug}.localhost:3000/login`
      : `${protocol}://${slug}.${root}/login`;

  console.log(`Клиника создана: ${clinic.name} (${clinic.slug})`);
  console.log(`Владелец: ${email}`);
  console.log(`URL входа: ${loginUrl}`);
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await client.end();
}
