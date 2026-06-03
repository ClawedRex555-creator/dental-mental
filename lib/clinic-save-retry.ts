export const CLINIC_SAVE_RETRY_DELAYS_MS = [0, 2000, 5000] as const;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
