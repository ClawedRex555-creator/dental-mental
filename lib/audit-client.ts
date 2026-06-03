import type { AuditAction, AuditResourceType } from "@/lib/audit-log.server";

export async function logAuditClient(input: {
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await fetch("/api/audit", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    /* журнал не должен блокировать UI */
  }
}
