import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createSessionToken,
  verifySessionToken,
} from "./auth-session.ts";

const SECRET = "roundtrip-test-secret";

describe("auth-session roundtrip (Node crypto)", () => {
  it("signs and verifies token with Cyrillic name", () => {
    process.env.AUTH_SECRET = SECRET;
    process.env.NODE_ENV = "test";

    const token = createSessionToken({
      userId: "u1",
      staffId: "doc-1",
      role: "doctor",
      name: "Макаров Дмитрий Сергеевич",
      email: "makarovds@yandex.ru",
      clinicId: "clinic-1",
      clinicSlug: "tstom",
    });

    const session = verifySessionToken(token);
    assert.equal(session?.userId, "u1");
    assert.equal(session?.role, "doctor");
    assert.equal(session?.clinicSlug, "tstom");
    assert.equal(session?.name, "Макаров Дмитрий Сергеевич");

    delete process.env.AUTH_SECRET;
  });
});
