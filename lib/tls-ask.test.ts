import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { secureCompareSecret, verifyTlsAskSecret } from "./tls-ask-auth";
import { evaluateTlsAskDomain } from "./tls-ask.server";
import { setTestEnv } from "./test-env";

const SECRET = "test-tls-ask-secret-value";

describe("tls-ask auth", () => {
  const prev = { ...process.env };

  beforeEach(() => {
    setTestEnv({ TLS_ASK_SECRET: SECRET, NODE_ENV: "test", APP_ROOT_DOMAIN: "emkaro.ru" });
  });

  afterEach(() => {
    setTestEnv(prev);
  });

  it("secureCompareSecret accepts matching secrets", () => {
    assert.equal(secureCompareSecret("abc", "abc"), true);
    assert.equal(secureCompareSecret("abc", "abd"), false);
  });

  it("verifyTlsAskSecret accepts correct header", () => {
    const req = new Request("http://app:3000/api/internal/tls-ask?domain=demo.emkaro.ru", {
      headers: { "X-TLS-Ask-Secret": SECRET },
    });
    assert.equal(verifyTlsAskSecret(req), true);
  });

  it("verifyTlsAskSecret rejects wrong secret", () => {
    const req = new Request("http://app:3000/api/internal/tls-ask?domain=demo.emkaro.ru", {
      headers: { "X-TLS-Ask-Secret": "wrong" },
    });
    assert.equal(verifyTlsAskSecret(req), false);
  });

  it("verifyTlsAskSecret rejects missing secret when configured", () => {
    const req = new Request("http://app:3000/api/internal/tls-ask?domain=demo.emkaro.ru");
    assert.equal(verifyTlsAskSecret(req), false);
  });
});

describe("tls-ask domain evaluation", () => {
  const prev = { ...process.env };

  beforeEach(() => {
    setTestEnv({ APP_ROOT_DOMAIN: "emkaro.ru" });
  });

  afterEach(() => {
    setTestEnv(prev);
  });

  it("allows known clinic slug", async () => {
    const status = await evaluateTlsAskDomain("demo.emkaro.ru", {
      findClinicBySlug: async () => ({ id: "c1" }),
    });
    assert.equal(status, 200);
  });

  it("rejects unknown clinic slug", async () => {
    const status = await evaluateTlsAskDomain("unknown.emkaro.ru", {
      findClinicBySlug: async () => null,
    });
    assert.equal(status, 403);
  });

  it("rejects invalid slug shape", async () => {
    const status = await evaluateTlsAskDomain("evil.com", {
      findClinicBySlug: async () => ({ id: "c1" }),
    });
    assert.equal(status, 403);
  });

  it("fails closed when DB is unavailable", async () => {
    const status = await evaluateTlsAskDomain("demo.emkaro.ru", {
      findClinicBySlug: async () => {
        throw new Error("connection refused");
      },
    });
    assert.equal(status, 403);
  });
});
