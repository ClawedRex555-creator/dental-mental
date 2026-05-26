import type { UserRole } from "@/lib/types";

export interface AuthAccountRecord {
  id: string;
  login: string;
  passwordHash: string;
  role: UserRole;
  name: string;
  staffId?: string;
}
