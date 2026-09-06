import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { verifyEmkaroSignHmac } from "./hmac";
import {
  maskPhoneForSign,
  resolveSignDocumentType,
} from "./document-types";

describe("resolveSignDocumentType", () => {
  it("maps contract to PAID_MEDICAL_SERVICES_CONTRACT", () => {
    const r = resolveSignDocumentType({
      kind: "contract",
      name: "Договор на оказание платных медуслуг",
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.code, "PAID_MEDICAL_SERVICES_CONTRACT");
      assert.equal(r.smsAllowed, true);
    }
  });

  it("maps estimate / additional agreement by name", () => {
    const estimate = resolveSignDocumentType({ kind: "contract", name: "Смета лечения" });
    assert.equal(estimate.ok && estimate.code, "ESTIMATE");

    const add = resolveSignDocumentType({
      kind: "contract",
      name: "Дополнительное соглашение №1",
    });
    assert.equal(add.ok && add.code, "ADDITIONAL_AGREEMENT");
  });

  it("maps IDS to INFORMED_MEDICAL_CONSENT and disallows SMS", () => {
    const byPrefix = resolveSignDocumentType({
      kind: "consent",
      name: "ИДС на терапевтическое лечение",
    });
    assert.equal(byPrefix.ok, true);
    if (byPrefix.ok) {
      assert.equal(byPrefix.code, "INFORMED_MEDICAL_CONSENT");
      assert.equal(byPrefix.smsAllowed, false);
    }

    const byWords = resolveSignDocumentType({
      kind: "consent",
      name: "Информированное добровольное согласие на медицинское вмешательство",
    });
    assert.equal(byWords.ok && byWords.code, "INFORMED_MEDICAL_CONSENT");
    assert.equal(byWords.ok && byWords.smsAllowed, false);
  });

  it("rejects plain PDN consent without inventing a type code", () => {
    const r = resolveSignDocumentType({
      kind: "consent",
      name: "Согласие на обработку персональных данных",
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.match(r.reason, /нельзя подписать через SMS/i);
    }
  });

  it("rejects health_card and egisz_refusal", () => {
    const card = resolveSignDocumentType({ kind: "health_card", name: "Карточка здоровья" });
    assert.equal(card.ok, false);

    const egisz = resolveSignDocumentType({
      kind: "egisz_refusal",
      name: "Отказ от ЕГИСЗ",
    });
    assert.equal(egisz.ok, false);
  });
});

describe("maskPhoneForSign", () => {
  it("masks national number without leaking middle digits", () => {
    const masked = maskPhoneForSign("+79991234567");
    assert.equal(masked, "+7 *** ***-45-67");
    assert.equal(masked.includes("999"), false);
    assert.equal(masked.includes("123"), false);
  });
});

describe("verifyEmkaroSignHmac", () => {
  it("accepts valid signature and rejects tampered", () => {
    const secret = "test-webhook-secret";
    const body = JSON.stringify({
      emkaroPatientId: "pat-1",
      clinicId: "660e8400-e29b-41d4-a716-446655440001",
    });
    const good = createHmac("sha256", secret).update(body).digest("hex");
    assert.equal(verifyEmkaroSignHmac(body, good, secret), true);
    assert.equal(verifyEmkaroSignHmac(body, "0".repeat(good.length), secret), false);
    assert.equal(verifyEmkaroSignHmac(body + " ", good, secret), false);
    assert.equal(verifyEmkaroSignHmac(body, good, "other"), false);
  });
});
