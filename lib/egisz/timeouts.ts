/** Распознавание AbortSignal.timeout / fetch abort */

export function isAbortTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { name?: string; message?: string; code?: number };
  if (e.name === "TimeoutError" || e.name === "AbortError") return true;
  const msg = (e.message ?? "").toLowerCase();
  return (
    msg.includes("aborted due to timeout") ||
    msg.includes("aborted due a timeout") ||
    msg.includes("the operation was aborted") ||
    msg.includes("signal timed out")
  );
}

export function signingTimeoutMs(): number {
  const raw = Number(process.env.EGISZ_SIGNING_TIMEOUT_MS ?? "300000");
  return Number.isFinite(raw) && raw >= 30_000 ? raw : 300_000;
}

export function n3TimeoutMs(): number {
  const raw = Number(process.env.EGISZ_N3_TIMEOUT_MS ?? "60000");
  return Number.isFinite(raw) && raw >= 5_000 ? raw : 60_000;
}
