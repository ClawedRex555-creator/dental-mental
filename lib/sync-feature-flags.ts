import "server-only";

function parseBooleanFlag(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const value = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return defaultValue;
}

export function isSyncRevisionCasEnabled(): boolean {
  return parseBooleanFlag("SYNC_REVISION_CAS_ENABLED", true);
}

export function isSyncSlotGuardEnabled(): boolean {
  return parseBooleanFlag("SYNC_APPOINTMENT_SERVER_CONFLICT_GUARD", true);
}

export function isSyncSseEnabled(): boolean {
  return parseBooleanFlag("SYNC_SSE_ENABLED", true);
}

