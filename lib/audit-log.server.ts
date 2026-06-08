import "server-only";

import { withDb } from "@/lib/db";
import type { AuditAction, AuditResourceType } from "@/lib/audit-validation";

export type { AuditAction, AuditResourceType } from "@/lib/audit-validation";

export interface AuditLogInput {
  clinicId?: string;
  userId?: string;
  userName?: string;
  userRole?: string;
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export async function writeAuditLog(entry: AuditLogInput): Promise<void> {
  await withDb(async (client) => {
    await client.query(
      `INSERT INTO audit_logs
        (clinic_id, user_id, user_name, user_role, action, resource_type, resource_id, ip_address, user_agent, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
      [
        entry.clinicId ?? null,
        entry.userId ?? null,
        entry.userName ?? null,
        entry.userRole ?? null,
        entry.action,
        entry.resourceType,
        entry.resourceId ?? null,
        entry.ipAddress ?? null,
        entry.userAgent ?? null,
        JSON.stringify(entry.metadata ?? {}),
      ]
    );
  });
}

export async function listAuditLogs(
  clinicId: string,
  limit = 100
): Promise<
  {
    id: string;
    action: string;
    resourceType: string;
    resourceId: string | null;
    userName: string | null;
    createdAt: string;
  }[]
> {
  return (
    (await withDb(async (client) => {
      const res = await client.query<{
        id: string;
        action: string;
        resource_type: string;
        resource_id: string | null;
        user_name: string | null;
        created_at: Date;
      }>(
        `SELECT id, action, resource_type, resource_id, user_name, created_at
         FROM audit_logs WHERE clinic_id = $1
         ORDER BY created_at DESC LIMIT $2`,
        [clinicId, limit]
      );
      return res.rows.map((r) => ({
        id: r.id,
        action: r.action,
        resourceType: r.resource_type,
        resourceId: r.resource_id,
        userName: r.user_name,
        createdAt: r.created_at.toISOString(),
      }));
    })) ?? []
  );
}

export function auditFromRequest(
  request: Request,
  base: Omit<AuditLogInput, "ipAddress" | "userAgent">
): AuditLogInput {
  return {
    ...base,
    ipAddress:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  };
}
