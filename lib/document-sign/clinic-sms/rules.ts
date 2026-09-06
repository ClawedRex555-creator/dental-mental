/** Pure rules for pairing / SMS tasks / webhooks — unit-testable without DB. */

export const PAIRING_TTL_MS = 5 * 60 * 1000;
export const PAIRING_RATE_WINDOW_MS = 15 * 60 * 1000;
export const PAIRING_RATE_MAX = 10;
export const PAIRING_ATTEMPT_RATE_MAX = 20;

export type PairingChallengeState = {
  usedAt: string | null;
  expiresAt: string;
};

export function evaluatePairingChallenge(
  challenge: PairingChallengeState | null,
  nowMs = Date.now()
): { ok: true } | { ok: false; error: string; status: number } {
  if (!challenge) return { ok: false, error: "Код привязки не найден", status: 404 };
  if (challenge.usedAt) return { ok: false, error: "Код уже использован", status: 410 };
  if (Date.parse(challenge.expiresAt) < nowMs) {
    return { ok: false, error: "Срок кода истёк", status: 410 };
  }
  return { ok: true };
}

export function assertDeviceClinicAccess(
  deviceClinicId: string,
  taskClinicId: string
): boolean {
  return deviceClinicId === taskClinicId;
}

export type SmsTaskTransition =
  | "present"
  | "open_composer"
  | "confirm_sent"
  | "cancel"
  | "expire";

const ALLOWED: Record<string, ReadonlySet<string>> = {
  CREATED: new Set(["WAITING_FOR_DEVICE", "PRESENTED_TO_DEVICE", "SMS_COMPOSER_OPENED", "MANUAL_SEND_CONFIRMED", "CANCELLED", "EXPIRED"]),
  WAITING_FOR_DEVICE: new Set(["PRESENTED_TO_DEVICE", "SMS_COMPOSER_OPENED", "MANUAL_SEND_CONFIRMED", "CANCELLED", "EXPIRED"]),
  PRESENTED_TO_DEVICE: new Set(["SMS_COMPOSER_OPENED", "MANUAL_SEND_CONFIRMED", "CANCELLED", "EXPIRED"]),
  SMS_COMPOSER_OPENED: new Set(["MANUAL_SEND_CONFIRMED", "CANCELLED", "EXPIRED"]),
  MANUAL_SEND_CONFIRMED: new Set(),
  CANCELLED: new Set(),
  EXPIRED: new Set(),
  FAILED: new Set(),
};

export function canTransitionSmsTask(
  from: string,
  to: string
): boolean {
  return ALLOWED[from]?.has(to) ?? false;
}

export function nextStatusForAction(
  current: string,
  action: SmsTaskTransition
): string | null {
  const map: Record<SmsTaskTransition, string> = {
    present: "PRESENTED_TO_DEVICE",
    open_composer: "SMS_COMPOSER_OPENED",
    confirm_sent: "MANUAL_SEND_CONFIRMED",
    cancel: "CANCELLED",
    expire: "EXPIRED",
  };
  const next = map[action];
  if (!canTransitionSmsTask(current, next)) return null;
  return next;
}

export function canCancelSignPackage(signatureStatus?: string, status?: string): boolean {
  if (status === "signed") return false;
  const s = (signatureStatus ?? "").toUpperCase();
  if (s === "SIGNED") return false;
  return true;
}

export const SIGN_WEBHOOK_EVENTS = [
  "signature.package.created",
  "signature.package.opened",
  "signature.document.opened",
  "signature.package.awaiting_confirmation",
  "signature.package.signed",
  "signature.package.expired",
  "signature.package.cancelled",
  "signature.package.failed",
] as const;

export type SignWebhookEvent = (typeof SIGN_WEBHOOK_EVENTS)[number];

export function isSupportedSignWebhookEvent(event: string): event is SignWebhookEvent {
  return (SIGN_WEBHOOK_EVENTS as readonly string[]).includes(event);
}

export function mapWebhookEventToSignatureStatus(event: string): string {
  const map: Record<string, string> = {
    "signature.package.created": "CREATED",
    "signature.package.opened": "OPENED",
    "signature.document.opened": "DOCUMENT_OPENED",
    "signature.package.awaiting_confirmation": "AWAITING_CONFIRMATION",
    "signature.package.signed": "SIGNED",
    "signature.package.expired": "EXPIRED",
    "signature.package.cancelled": "CANCELLED",
    "signature.package.failed": "FAILED",
  };
  return map[event] ?? event;
}

export function isWebhookTimestampFresh(
  timestamp: string | undefined,
  nowMs = Date.now(),
  maxSkewMs = 5 * 60 * 1000
): boolean {
  if (!timestamp) return true;
  const ts = Date.parse(timestamp);
  if (!Number.isFinite(ts)) return false;
  return Math.abs(nowMs - ts) <= maxSkewMs;
}

export function buildSignIdempotencyKey(input: {
  clinicId: string;
  patientId: string;
  documentIds: string[];
}): string {
  const docs = [...input.documentIds].sort().join(",");
  return `${input.clinicId}:${input.patientId}:${docs}`;
}

export function assertProductionGuards(env: {
  NODE_ENV?: string;
  EMKARO_SIGN_MOCK?: string;
}): { ok: true } | { ok: false; error: string } {
  if (env.NODE_ENV === "production" && env.EMKARO_SIGN_MOCK?.trim() === "1") {
    return { ok: false, error: "EMKARO_SIGN_MOCK cannot be enabled in production" };
  }
  return { ok: true };
}

export function buildSmsUri(phone: string, body: string): string {
  return `sms:${encodeURIComponent(phone)}?body=${encodeURIComponent(body)}`;
}
