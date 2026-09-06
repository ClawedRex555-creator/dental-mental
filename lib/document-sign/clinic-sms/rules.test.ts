import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertDeviceClinicAccess,
  assertProductionGuards,
  buildSignIdempotencyKey,
  buildSmsUri,
  canCancelSignPackage,
  canTransitionSmsTask,
  evaluatePairingChallenge,
  isSupportedSignWebhookEvent,
  isWebhookTimestampFresh,
  mapWebhookEventToSignatureStatus,
  nextStatusForAction,
} from "./rules";
import {
  __resetSignSenderRateLimitForTests,
  checkSignSenderRateLimit,
  recordSignSenderRateLimit,
} from "./rate-limit";

describe("pairing challenge", () => {
  it("rejects missing / used / expired", () => {
    assert.equal(evaluatePairingChallenge(null).ok, false);
    assert.equal(
      evaluatePairingChallenge({
        usedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }).ok,
      false
    );
    assert.equal(
      evaluatePairingChallenge({
        usedAt: null,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      }).ok,
      false
    );
    assert.equal(
      evaluatePairingChallenge({
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }).ok,
      true
    );
  });

  it("rejects replay of used token", () => {
    const used = evaluatePairingChallenge({
      usedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    assert.equal(used.ok, false);
    if (!used.ok) assert.equal(used.status, 410);
  });
});

describe("tenant isolation", () => {
  it("clinic A device cannot access clinic B task", () => {
    assert.equal(assertDeviceClinicAccess("clinic-a", "clinic-b"), false);
    assert.equal(assertDeviceClinicAccess("clinic-a", "clinic-a"), true);
  });
});

describe("sms task transitions", () => {
  it("allows confirm after composer", () => {
    assert.equal(canTransitionSmsTask("SMS_COMPOSER_OPENED", "MANUAL_SEND_CONFIRMED"), true);
    assert.equal(nextStatusForAction("SMS_COMPOSER_OPENED", "confirm_sent"), "MANUAL_SEND_CONFIRMED");
  });

  it("blocks confirm from cancelled", () => {
    assert.equal(nextStatusForAction("CANCELLED", "confirm_sent"), null);
  });

  it("blocks DELIVERED status", () => {
    assert.equal(canTransitionSmsTask("SMS_COMPOSER_OPENED", "DELIVERED"), false);
  });
});

describe("cancel package rules", () => {
  it("forbids cancel after SIGNED", () => {
    assert.equal(canCancelSignPackage("SIGNED", "pending"), false);
    assert.equal(canCancelSignPackage(undefined, "signed"), false);
    assert.equal(canCancelSignPackage("READY_TO_SEND", "pending"), true);
  });
});

describe("webhook events", () => {
  it("supports required events", () => {
    assert.equal(isSupportedSignWebhookEvent("signature.package.signed"), true);
    assert.equal(isSupportedSignWebhookEvent("signature.package.cancelled"), true);
    assert.equal(isSupportedSignWebhookEvent("random"), false);
  });

  it("maps signed / expired / cancelled", () => {
    assert.equal(mapWebhookEventToSignatureStatus("signature.package.signed"), "SIGNED");
    assert.equal(mapWebhookEventToSignatureStatus("signature.package.expired"), "EXPIRED");
    assert.equal(mapWebhookEventToSignatureStatus("signature.package.cancelled"), "CANCELLED");
    assert.equal(mapWebhookEventToSignatureStatus("signature.package.failed"), "FAILED");
  });

  it("rejects stale timestamp", () => {
    const old = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    assert.equal(isWebhookTimestampFresh(old), false);
    assert.equal(isWebhookTimestampFresh(new Date().toISOString()), true);
  });
});

describe("idempotency key", () => {
  it("same docs same key regardless of order", () => {
    const a = buildSignIdempotencyKey({
      clinicId: "c1",
      patientId: "p1",
      documentIds: ["d2", "d1"],
    });
    const b = buildSignIdempotencyKey({
      clinicId: "c1",
      patientId: "p1",
      documentIds: ["d1", "d2"],
    });
    assert.equal(a, b);
    const c = buildSignIdempotencyKey({
      clinicId: "c1",
      patientId: "p1",
      documentIds: ["d1"],
    });
    assert.notEqual(a, c);
  });
});

describe("production guards", () => {
  it("blocks mock in production", () => {
    assert.equal(
      assertProductionGuards({ NODE_ENV: "production", EMKARO_SIGN_MOCK: "1" }).ok,
      false
    );
    assert.equal(
      assertProductionGuards({ NODE_ENV: "development", EMKARO_SIGN_MOCK: "1" }).ok,
      true
    );
  });
});

describe("sms uri", () => {
  it("pre-fills recipient and body", () => {
    const uri = buildSmsUri("+79991234567", "hello link");
    assert.match(uri, /^sms:/);
    assert.match(uri, /79991234567/);
    assert.match(uri, /hello/);
  });
});

describe("pairing rate limit", () => {
  it("blocks after max attempts", () => {
    __resetSignSenderRateLimitForTests();
    const key = "test-pair";
    for (let i = 0; i < 10; i++) recordSignSenderRateLimit(key, 60_000);
    assert.equal(checkSignSenderRateLimit(key, 10).allowed, false);
    assert.equal(checkSignSenderRateLimit(key, 20).allowed, true);
  });
});
