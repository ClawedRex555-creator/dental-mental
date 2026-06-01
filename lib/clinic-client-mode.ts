/** Устанавливается ClinicDataSync после /api/clinic/context или /api/clinic/data */
let serverDatabaseMode = false;

export function setClinicServerDatabaseMode(enabled: boolean): void {
  serverDatabaseMode = enabled;
}

export function isClinicServerDatabaseMode(): boolean {
  return serverDatabaseMode;
}
