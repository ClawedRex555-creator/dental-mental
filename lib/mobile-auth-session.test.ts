import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createMobileAccessToken,
  MOBILE_ACCESS_TOKEN_HOURS,
  verifyMobileAccessToken,
} from "./mobile-auth";

describe("mobile auth sessionVersion + TTL", () => {
  it("embeds sessionVersion and short TTL (~8h)", () => {
    const before = Date.now();
    const token = createMobileAccessToken({
      kind: "staff",
      userId: "user_1",
      role: "doctor",
      name: "Доктор",
      email: "doc@example.com",
      clinicId: "clinic-uuid",
      clinicSlug: "tstom",
      staffId: "doc_1",
      sessionVersion: 3,
    });
    const parsed = verifyMobileAccessToken(token);
    assert.ok(parsed);
    assert.equal(parsed?.sessionVersion, 3);
    const maxMs = MOBILE_ACCESS_TOKEN_HOURS * 60 * 60 * 1000;
    assert.ok((parsed?.exp ?? 0) <= before + maxMs + 1000);
    assert.ok((parsed?.exp ?? 0) > before + maxMs - 60_000);
  });

});
