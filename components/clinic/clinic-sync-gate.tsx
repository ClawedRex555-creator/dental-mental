"use client";

/** Раньше блокировал весь UI — критичные алерты только в ClinicDataSaveBanner */
export function ClinicSyncGate({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
