import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import {
  maskPhoneDisplay,
  redactSignUrl,
  secureCompare,
  sha256Hex,
} from "./crypto";
import { verifyEmkaroSignHmac } from "../emkaro-sign/hmac";
import { CLINIC_SMS_TASK_STATUS_LABELS } from "./types";

describe("clinic-sms crypto", () => {
  it("redacts sign URL token", () => {
    const redacted = redactSignUrl("https://sign.emkaro.ru/s/super-secret-token?x=1");
    assert.equal(redacted.includes("super-secret-token"), false);
    assert.match(redacted, /\[redacted\]/);
  });

  it("masks phone", () => {
    assert.equal(maskPhoneDisplay("+79991234567"), "+7 *** ***-45-67");
  });

  it("sha256 is stable", () => {
    assert.equal(sha256Hex("a"), sha256Hex("a"));
    assert.notEqual(sha256Hex("a"), sha256Hex("b"));
  });

  it("secureCompare", () => {
    assert.equal(secureCompare("abc", "abc"), true);
    assert.equal(secureCompare("abc", "abd"), false);
  });
});

describe("webhook hmac", () => {
  it("valid vs invalid", () => {
    const secret = "whsec";
    const body = JSON.stringify({ eventId: "e1", packageId: "p1" });
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    assert.equal(verifyEmkaroSignHmac(body, sig, secret), true);
    assert.equal(verifyEmkaroSignHmac(body, "00".repeat(32), secret), false);
  });
});

describe("status labels", () => {
  it("never claims delivery", () => {
    assert.equal("DELIVERED" in CLINIC_SMS_TASK_STATUS_LABELS, false);
    assert.match(
      CLINIC_SMS_TASK_STATUS_LABELS.MANUAL_SEND_CONFIRMED,
      /подтвердил отправку/i
    );
  });
});
