import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { signSessionBody } from "./auth-session-crypto";
import { readAuthSecretEnv } from "./auth-env";
import { verifySessionTokenEdge } from "./auth-session-edge";
import {
  stringToBase64Url,
  validateSessionTokenPayload,
} from "./auth-session-token";
import { setTestEnv } from "./test-env";

const TEST_SECRET = "test-secret-for-security-suite";

async function createTestToken(payload: {
  userId: string;
  role: string;
  name: string;
  email: string;
  exp?: number;
}): Promise<string> {
  setTestEnv({ AUTH_SECRET: TEST_SECRET, NODE_ENV: "test" });
  const body = JSON.stringify({
    ...payload,
    exp: payload.exp ?? Date.now() + 60_000,
  });
  const sig = await signSessionBody(body);
  return `${stringToBase64Url(body)}.${sig}`;
}

describe("auth session HMAC (edge)", () => {
  it("accepts valid signed token", async () => {
    const token = await createTestToken({
      userId: "u1",
      role: "doctor",
      name: "Test",
      email: "t@test.ru",
    });
    const session = await verifySessionTokenEdge(token);
    assert.equal(session?.userId, "u1");
    assert.equal(session?.role, "doctor");
    setTestEnv({ AUTH_SECRET: undefined });
  });

  it("rejects forged owner role with invalid signature", async () => {
    setTestEnv({ AUTH_SECRET: TEST_SECRET, NODE_ENV: "test" });
    const body = JSON.stringify({
      userId: "u1",
      role: "owner",
      name: "Hacker",
      email: "x@y.z",
      exp: Date.now() + 60_000,
    });
    const bodyB64 = stringToBase64Url(body);
    const badSig = createHmac("sha256", "wrong-secret").update(body).digest("base64url");
    assert.equal(await verifySessionTokenEdge(`${bodyB64}.${badSig}`), null);
    setTestEnv({ AUTH_SECRET: undefined });
  });

  it("rejects expired payload", () => {
    const expired = validateSessionTokenPayload({
      userId: "u1",
      role: "admin",
      name: "A",
      email: "a@b.c",
      exp: Date.now() - 1000,
    });
    assert.equal(expired, null);
  });

  it("reads AUTH_SECRET via dynamic env key", () => {
    setTestEnv({ AUTH_SECRET: TEST_SECRET });
    assert.equal(readAuthSecretEnv(), TEST_SECRET);
    setTestEnv({ AUTH_SECRET: undefined });
  });

  it("rejects token without valid signature", async () => {
    const token = await createTestToken({
      userId: "u1",
      role: "admin",
      name: "A",
      email: "a@b.c",
    });
    const tampered = `${token.slice(0, -3)}xxx`;
    assert.equal(await verifySessionTokenEdge(tampered), null);
    setTestEnv({ AUTH_SECRET: undefined });
  });

  it("rejects fully forged owner payload (middleware must not trust structure-only parse)", async () => {
    setTestEnv({ AUTH_SECRET: TEST_SECRET, NODE_ENV: "test" });
    const body = JSON.stringify({
      userId: "forged",
      role: "owner",
      name: "Attacker",
      email: "evil@evil.ru",
      clinicSlug: "victim",
      exp: Date.now() + 60_000,
    });
    const forged = `${stringToBase64Url(body)}.invalid-signature`;
    assert.equal(await verifySessionTokenEdge(forged), null);
    setTestEnv({ AUTH_SECRET: undefined });
  });
});
