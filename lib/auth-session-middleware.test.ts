import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { readSessionFromCookie } from "./auth-session-middleware";
import { stringToBase64Url } from "./auth-session-token";

const SECRET = "test-middleware-secret";

function signBody(body: string): string {
  return createHmac("sha256", SECRET).update(body).digest("base64url");
}

function makeToken(payload: Record<string, unknown>): string {
  const body = JSON.stringify({
    ...payload,
    exp: Date.now() + 60_000,
  });
  return `${stringToBase64Url(body)}.${signBody(body)}`;
}

describe("readSessionFromCookie (middleware routing)", () => {
  it("reads valid signed token without verifying HMAC in middleware", () => {
    const token = makeToken({
      userId: "u1",
      role: "doctor",
      name: "Test",
      email: "t@test.ru",
      clinicSlug: "tstom",
    });
    const session = readSessionFromCookie(token);
    assert.equal(session?.userId, "u1");
    assert.equal(session?.role, "doctor");
  });

  it("rejects expired token", () => {
    const body = JSON.stringify({
      userId: "u1",
      role: "doctor",
      name: "Test",
      email: "t@test.ru",
      exp: Date.now() - 1000,
    });
    const token = `${stringToBase64Url(body)}.${signBody(body)}`;
    assert.equal(readSessionFromCookie(token), null);
  });
});
