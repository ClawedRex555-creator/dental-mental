/** Демо-учётки только в development или при явном флаге */
export function isDemoAccountsEnabled(): boolean {
  if (process.env.ENABLE_DEMO_ACCOUNTS === "true") return true;
  if (process.env.ENABLE_DEMO_ACCOUNTS === "false") return false;
  return process.env.NODE_ENV !== "production";
}

/** Production must never run with demo credentials enabled. */
export function assertDemoAccountsNotEnabledInProduction(): void {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_DEMO_ACCOUNTS === "true") {
    throw new Error("ENABLE_DEMO_ACCOUNTS cannot be true in production");
  }
}
