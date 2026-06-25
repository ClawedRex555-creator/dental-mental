import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMobileAccessToken, verifyMobileAccessToken } from "./mobile-auth";

describe("mobile auth token", () => {
  it("round-trips patient payload", () => {
    const token = createMobileAccessToken({
      kind: "patient",
      userId: "mpa_1",
      role: "patient",
      name: "Иван Иванов",
      email: "patient@example.com",
      clinicId: "clinic-uuid",
      clinicSlug: "tstom",
      patientId: "pat_1",
    });
    const parsed = verifyMobileAccessToken(token);
    assert.ok(parsed);
    assert.equal(parsed?.kind, "patient");
    assert.equal(parsed?.patientId, "pat_1");
    assert.equal(parsed?.clinicSlug, "tstom");
  });

  it("round-trips staff payload", () => {
    const token = createMobileAccessToken({
      kind: "staff",
      userId: "user_1",
      role: "doctor",
      name: "Доктор",
      email: "doc@example.com",
      clinicId: "clinic-uuid",
      clinicSlug: "tstom",
      staffId: "doc_1",
    });
    const parsed = verifyMobileAccessToken(token);
    assert.ok(parsed);
    assert.equal(parsed?.kind, "staff");
    assert.equal(parsed?.role, "doctor");
    assert.equal(parsed?.staffId, "doc_1");
  });

  it("rejects tampered token", () => {
    const token = createMobileAccessToken({
      kind: "patient",
      userId: "mpa_1",
      role: "patient",
      name: "Test",
      email: "t@example.com",
      clinicId: "c1",
      clinicSlug: "tstom",
      patientId: "pat_1",
    });
    const tampered = `${token.slice(0, -1)}x`;
    assert.equal(verifyMobileAccessToken(tampered), null);
  });
});
