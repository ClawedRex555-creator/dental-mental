/** Демо-учётки только в development или при явном флаге */
export function isDemoAccountsEnabled(): boolean {
  if (process.env.ENABLE_DEMO_ACCOUNTS === "true") return true;
  if (process.env.ENABLE_DEMO_ACCOUNTS === "false") return false;
  return process.env.NODE_ENV !== "production";
}
