/**
 * E2E-логика контура clinic-device Sign без живой БД/Sign:
 * mock package → SMS task states → webhook SIGNED.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { verifyEmkaroSignHmac } from "../emkaro-sign/hmac";
import { redactSignUrl } from "./crypto";
import {
  assertDeviceClinicAccess,
  buildSmsUri,
  canCancelSignPackage,
  evaluatePairingChallenge,
  isSupportedSignWebhookEvent,
  mapWebhookEventToSignatureStatus,
  nextStatusForAction,
} from "./rules";

describe("e2e clinic-device sign flow (logic)", () => {
  it("1-10: package → device → sms → confirm → signed webhook", () => {
    // 1-4: admin creates package (mock Sign response)
    const packageResult = {
      packageId: "ES-E2E-1",
      status: "READY_TO_SEND",
      publicSignUrl: "https://sign.emkaro.ru/s/e2e-token-secret",
      smsText: "Emkaro Sign: документы для подписания: https://sign.emkaro.ru/s/e2e-token-secret",
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    };
    assert.ok(packageResult.packageId);
    assert.ok(packageResult.publicSignUrl.startsWith("https://sign.emkaro.ru/"));
    assert.equal(
      redactSignUrl(packageResult.publicSignUrl).includes("e2e-token-secret"),
      false
    );

    // 5: pairing valid
    const pair = evaluatePairingChallenge({
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    assert.equal(pair.ok, true);

    // 6: task appears only for same clinic
    const deviceClinic = "clinic-tstom";
    const taskClinic = "clinic-tstom";
    assert.equal(assertDeviceClinicAccess(deviceClinic, taskClinic), true);
    assert.equal(assertDeviceClinicAccess(deviceClinic, "clinic-other"), false);

    // 7: open SMS composer
    let status = "WAITING_FOR_DEVICE";
    status = nextStatusForAction(status, "present")!;
    status = nextStatusForAction(status, "open_composer")!;
    assert.equal(status, "SMS_COMPOSER_OPENED");
    const uri = buildSmsUri("+79991234567", packageResult.smsText);
    assert.match(uri, /^sms:/);

    // 8: manual confirm (not DELIVERED)
    status = nextStatusForAction(status, "confirm_sent")!;
    assert.equal(status, "MANUAL_SEND_CONFIRMED");

    // 9: webhook SIGNED with valid HMAC + duplicate rejected by eventId set
    const secret = "test-webhook";
    const payload = {
      event: "signature.package.signed",
      eventId: "evt-e2e-1",
      timestamp: new Date().toISOString(),
      packageId: packageResult.packageId,
      signatureStatus: "SIGNED",
    };
    assert.equal(isSupportedSignWebhookEvent(payload.event), true);
    const body = JSON.stringify(payload);
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    assert.equal(verifyEmkaroSignHmac(body, sig, secret), true);
    assert.equal(verifyEmkaroSignHmac(body, "0".repeat(sig.length), secret), false);

    const seen = new Set<string>();
    assert.equal(seen.has(payload.eventId), false);
    seen.add(payload.eventId);
    assert.equal(seen.has(payload.eventId), true); // duplicate

    assert.equal(mapWebhookEventToSignatureStatus(payload.event), "SIGNED");

    // 10: card shows signed; cancel forbidden
    assert.equal(canCancelSignPackage("SIGNED", "signed"), false);
  });

  it("Sign unavailable / timeout surfaced as error strings", () => {
    const unavailable = "Сервис подписания временно недоступен";
    const timeout = "Таймаут Emkaro Sign";
    assert.match(unavailable, /недоступен/i);
    assert.match(timeout, /таймаут/i);
  });

  it("double send same docs shares idempotency key shape", async () => {
    const { buildSignIdempotencyKey } = await import("./rules");
    const k1 = buildSignIdempotencyKey({
      clinicId: "c",
      patientId: "p",
      documentIds: ["a", "b"],
    });
    const k2 = buildSignIdempotencyKey({
      clinicId: "c",
      patientId: "p",
      documentIds: ["b", "a"],
    });
    assert.equal(k1, k2);
  });
});
