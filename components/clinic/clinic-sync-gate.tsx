"use client";

/** Раньше блокировал весь UI — теперь только тонкая полоска в ClinicDataSaveBanner */
export function ClinicSyncGate({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
