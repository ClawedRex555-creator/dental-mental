import "server-only";

import { assertDemoAccountsNotEnabledInProduction } from "@/lib/demo-accounts";

/** Fail fast in production when required secrets or unsafe flags are missing. */
export function validateProductionEnv(): void {
  if (process.env.NODE_ENV !== "production") return;

  if (!process.env.AUTH_SECRET?.trim()) {
    throw new Error("AUTH_SECRET is required in production");
  }
  if (!process.env.PHI_ENCRYPTION_KEY?.trim()) {
    throw new Error("PHI_ENCRYPTION_KEY is required in production");
  }
  assertDemoAccountsNotEnabledInProduction();
}
