import { NextResponse } from "next/server";
import { assertClinicHost } from "@/lib/assert-clinic-host";
import { verifySameOrigin } from "@/lib/csrf-origin";
import {
  createPairingChallenge,
  listClinicSenderDevices,
  revokeDevice,
} from "@/lib/document-sign/clinic-sms/devices.server";
import {
  PAIRING_RATE_MAX,
  PAIRING_RATE_WINDOW_MS,
} from "@/lib/document-sign/clinic-sms/rules";
import {
  checkSignSenderRateLimit,
  recordSignSenderRateLimit,
} from "@/lib/document-sign/clinic-sms/rate-limit";
import { getServerSession } from "@/lib/get-server-session";
import { isDatabaseEnabled } from "@/lib/db";

async function requireStaff(request: Request) {
  const session = await getServerSession();
  if (!session?.clinicId || !session.clinicSlug || session.isSuperAdmin) {
    return { error: NextResponse.json({ error: "Доступ запрещён" }, { status: 403 }) };
  }
  const hostDenied = assertClinicHost(session, request);
  if (hostDenied) return { error: hostDenied };
  return { session: { ...session, clinicId: session.clinicId, clinicSlug: session.clinicSlug } };
}

export async function GET(request: Request) {
  if (!isDatabaseEnabled()) {
    return NextResponse.json({ error: "Сервис недоступен" }, { status: 503 });
  }
  const auth = await requireStaff(request);
  if ("error" in auth && auth.error) return auth.error;
  const { session } = auth as { session: { clinicId: string } };
  const devices = await listClinicSenderDevices(session.clinicId);
  return NextResponse.json({
    devices: devices.map((d) => ({
      id: d.id,
      displayName: d.displayName,
      declaredPhoneNumber: d.declaredPhoneNumber,
      deviceName: d.deviceName,
      platform: d.platform,
      pairedAt: d.pairedAt,
      lastSeenAt: d.lastSeenAt,
      isPrimary: d.isPrimary,
      status: d.status,
    })),
  });
}

export async function POST(request: Request) {
  if (!isDatabaseEnabled()) {
    return NextResponse.json({ error: "Сервис недоступен" }, { status: 503 });
  }
  if (!verifySameOrigin(request)) {
    return NextResponse.json({ error: "Запрос отклонён" }, { status: 403 });
  }
  const auth = await requireStaff(request);
  if ("error" in auth && auth.error) return auth.error;
  const { session } = auth as {
    session: { clinicId: string; userId: string };
  };

  let body: { action?: string; deviceId?: string } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  if (body.action === "revoke" && body.deviceId) {
    const ok = await revokeDevice(session.clinicId, body.deviceId);
    if (!ok) return NextResponse.json({ error: "Устройство не найдено" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  const rateKey = `pair-create:${session.clinicId}`;
  const rate = checkSignSenderRateLimit(rateKey, PAIRING_RATE_MAX);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Слишком много запросов кода", retryAfterSec: rate.retryAfterSec },
      { status: 429 }
    );
  }
  recordSignSenderRateLimit(rateKey, PAIRING_RATE_WINDOW_MS);

  const pairing = await createPairingChallenge({
    clinicId: session.clinicId,
    createdByUserId: session.userId,
  });
  return NextResponse.json({
    pairingId: pairing.pairingId,
    token: pairing.token,
    shortCode: pairing.shortCode,
    expiresAt: pairing.expiresAt,
    qrPayload: pairing.qrPayload,
    pairUrl: `/sign/sender-device?code=${pairing.shortCode}`,
  });
}
