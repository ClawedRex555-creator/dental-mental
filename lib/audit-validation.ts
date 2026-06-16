export const AUDIT_ACTIONS = [
  "view",
  "create",
  "update",
  "delete",
  "export",
  "print",
  "login",
  "logout",
] as const;

export const AUDIT_RESOURCE_TYPES = [
  "patient",
  "medical_record",
  "appointment",
  "payment",
  "work_act",
  "treatment_plan",
  "settings",
  "auth",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
export type AuditResourceType = (typeof AUDIT_RESOURCE_TYPES)[number];

const ACTION_SET = new Set<string>(AUDIT_ACTIONS);
const RESOURCE_SET = new Set<string>(AUDIT_RESOURCE_TYPES);

export function isValidAuditAction(value: unknown): value is AuditAction {
  return typeof value === "string" && ACTION_SET.has(value);
}

export function isValidAuditResourceType(value: unknown): value is AuditResourceType {
  return typeof value === "string" && RESOURCE_SET.has(value);
}

/** Client audit POST must not forge login/logout — those are server-only. */
export function isClientAuditAction(value: unknown): value is AuditAction {
  return (
    isValidAuditAction(value) && value !== "login" && value !== "logout"
  );
}

export const AUDIT_METADATA_MAX_BYTES = 4096;
const RESOURCE_ID_RE = /^[a-zA-Z0-9-]{1,128}$/;

export function isValidAuditResourceId(value: unknown): value is string {
  return typeof value === "string" && RESOURCE_ID_RE.test(value);
}

export function isValidAuditMetadata(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  try {
    return JSON.stringify(value).length <= AUDIT_METADATA_MAX_BYTES;
  } catch {
    return false;
  }
}
