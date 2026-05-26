import "server-only";

import { hashPassword } from "@/lib/auth-password";
import type { AuthAccountRecord } from "@/lib/auth-account-types";
import type { UserRole } from "@/lib/types";

const SEED_RAW: Array<{
  id: string;
  login: string;
  password: string;
  role: UserRole;
  name: string;
  staffId?: string;
}> = [
  {
    id: "auth-owner",
    login: "owner@clinic.ru",
    password: "owner123",
    role: "owner",
    name: "Владелец клиники",
  },
  {
    id: "auth-admin",
    login: "admin@clinic.ru",
    password: "admin123",
    role: "admin",
    name: "Администратор",
  },
  {
    id: "auth-doctor",
    login: "doctor@clinic.ru",
    password: "doctor123",
    role: "doctor",
    name: "Врач (демо)",
    staffId: "doc-demo",
  },
  {
    id: "auth-assistant",
    login: "assistant@clinic.ru",
    password: "assistant123",
    role: "assistant",
    name: "Ассистент (демо)",
    staffId: "doc-assistant-demo",
  },
  {
    id: "auth-accountant",
    login: "accountant@clinic.ru",
    password: "accountant123",
    role: "accountant",
    name: "Бухгалтер (демо)",
  },
];

let cached: AuthAccountRecord[] | null = null;

export function getSeedAuthAccounts(): AuthAccountRecord[] {
  if (!cached) {
    cached = SEED_RAW.map((a) => ({
      id: a.id,
      login: a.login.toLowerCase(),
      passwordHash: hashPassword(a.password),
      role: a.role,
      name: a.name,
      staffId: a.staffId,
    }));
  }
  return cached;
}
