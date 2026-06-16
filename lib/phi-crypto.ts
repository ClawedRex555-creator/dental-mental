import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import type { ClinicPersistedState } from "@/lib/clinic-persisted-state";
import type { Patient } from "@/lib/types";

const ALGO = "aes-256-gcm";
const PREFIX = "enc:v1:";

const SENSITIVE_PATIENT_FIELDS: (keyof Patient)[] = [
  "firstName",
  "lastName",
  "middleName",
  "snils",
  "passportSeries",
  "passportNumber",
  "phone",
  "email",
  "address",
  "notes",
  "diagnosis",
];

function resolveKey(): Buffer | null {
  const raw = process.env.PHI_ENCRYPTION_KEY?.trim();
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("PHI_ENCRYPTION_KEY is required in production");
    }
    return null;
  }
  return createHash("sha256").update(raw).digest();
}

export function isPhiEncryptionEnabled(): boolean {
  return Boolean(process.env.PHI_ENCRYPTION_KEY?.trim());
}

function encryptField(value: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${enc.toString("base64url")}`;
}

function decryptField(value: string, key: Buffer): string {
  if (!value.startsWith(PREFIX)) return value;
  const body = value.slice(PREFIX.length);
  const [ivB64, tagB64, dataB64] = body.split(".");
  if (!ivB64 || !tagB64 || !dataB64) return value;
  const iv = Buffer.from(ivB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");
  const data = Buffer.from(dataB64, "base64url");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

function encryptPatient(patient: Patient, key: Buffer): Patient {
  const out = { ...patient };
  for (const field of SENSITIVE_PATIENT_FIELDS) {
    const val = out[field];
    if (typeof val === "string" && val && !val.startsWith(PREFIX)) {
      (out as Record<string, unknown>)[field] = encryptField(val, key);
    }
  }
  return out;
}

function decryptPatient(patient: Patient, key: Buffer): Patient {
  const out = { ...patient };
  for (const field of SENSITIVE_PATIENT_FIELDS) {
    const val = out[field];
    if (typeof val === "string" && val.startsWith(PREFIX)) {
      try {
        (out as Record<string, unknown>)[field] = decryptField(val, key);
      } catch {
        /* оставляем как есть при ошибке ключа */
      }
    }
  }
  return out;
}

/** Шифрование ПДн пациентов перед записью в БД (152-ФЗ, хранение) */
export function encryptClinicSnapshotPhi(state: ClinicPersistedState): ClinicPersistedState {
  const key = resolveKey();
  if (!key) return state;
  return {
    ...state,
    patients: state.patients.map((p) => encryptPatient(p, key)),
  };
}

/** Расшифровка при чтении из БД */
export function decryptClinicSnapshotPhi(state: ClinicPersistedState): ClinicPersistedState {
  const key = resolveKey();
  if (!key) return state;
  return {
    ...state,
    patients: state.patients.map((p) => decryptPatient(p, key)),
  };
}

/** Маскирование для отображения в логах */
export function maskSensitive(value: string | undefined): string {
  if (!value) return "—";
  if (value.length <= 4) return "****";
  return `${"*".repeat(Math.min(value.length - 2, 6))}${value.slice(-2)}`;
}
