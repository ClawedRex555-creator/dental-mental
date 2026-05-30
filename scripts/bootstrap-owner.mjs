#!/usr/bin/env node
/**
 * Создаёт первого владельца клиники (production без demo-учёток).
 * Использование:
 *   BOOTSTRAP_OWNER_EMAIL=owner@clinic.ru \
 *   BOOTSTRAP_OWNER_PASSWORD='StrongPass123!' \
 *   BOOTSTRAP_OWNER_NAME='Владелец' \
 *   node scripts/bootstrap-owner.mjs
 */
import { createHash, randomBytes, scryptSync } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const ACCOUNTS_FILE = path.join(DATA_DIR, "auth-accounts.json");

const email = process.env.BOOTSTRAP_OWNER_EMAIL?.trim().toLowerCase();
const password = process.env.BOOTSTRAP_OWNER_PASSWORD ?? "";
const name = process.env.BOOTSTRAP_OWNER_NAME?.trim() || "Владелец клиники";

if (!email || !password) {
  console.error("Задайте BOOTSTRAP_OWNER_EMAIL и BOOTSTRAP_OWNER_PASSWORD");
  process.exit(1);
}
if (password.length < 8) {
  console.error("Пароль не менее 8 символов");
  process.exit(1);
}

function hashPassword(raw) {
  const salt = randomBytes(16);
  const hash = scryptSync(raw, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

let existing = [];
if (existsSync(ACCOUNTS_FILE)) {
  try {
    existing = JSON.parse(readFileSync(ACCOUNTS_FILE, "utf8"));
  } catch {
    existing = [];
  }
}

if (!Array.isArray(existing)) existing = [];

if (existing.some((a) => a.login === email)) {
  console.error(`Учётка ${email} уже существует`);
  process.exit(1);
}

const record = {
  id: `auth-owner-${createHash("sha256").update(email).digest("hex").slice(0, 12)}`,
  login: email,
  passwordHash: hashPassword(password),
  role: "owner",
  name,
};

existing.push(record);
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
writeFileSync(ACCOUNTS_FILE, JSON.stringify(existing, null, 2), "utf8");

console.log(`Создан владелец: ${email}`);
