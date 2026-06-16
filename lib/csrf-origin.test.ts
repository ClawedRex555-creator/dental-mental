import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import { verifySameOrigin } from "./csrf-origin";
import { setTestEnv } from "./test-env";

describe("csrf origin", () => {
  const prev = { ...process.env };

  afterEach(() => {
    setTestEnv(prev);
  });

  it("accepts matching Origin header", () => {
    const req = new Request("http://demo.emkaro.ru/api/clinic/data", {
      method: "PUT",
      headers: {
        host: "demo.emkaro.ru",
        origin: "http://demo.emkaro.ru",
      },
    });
    assert.equal(verifySameOrigin(req), true);
  });

  it("rejects mismatched Origin", () => {
    const req = new Request("http://demo.emkaro.ru/api/clinic/data", {
      method: "PUT",
      headers: {
        host: "demo.emkaro.ru",
        origin: "http://evil.example.com",
      },
    });
    assert.equal(verifySameOrigin(req), false);
  });

  it("accepts matching Referer when Origin absent", () => {
    const req = new Request("http://demo.emkaro.ru/api/audit", {
      method: "POST",
      headers: {
        host: "demo.emkaro.ru",
        referer: "http://demo.emkaro.ru/patients",
      },
    });
    assert.equal(verifySameOrigin(req), true);
  });

  it("allows missing Origin/Referer outside production", () => {
    setTestEnv({ NODE_ENV: "development" });
    const req = new Request("http://demo.emkaro.ru/api/audit", {
      method: "POST",
      headers: { host: "demo.emkaro.ru" },
    });
    assert.equal(verifySameOrigin(req), true);
  });

  it("rejects missing Origin/Referer in production", () => {
    setTestEnv({ NODE_ENV: "production" });
    const req = new Request("http://demo.emkaro.ru/api/audit", {
      method: "POST",
      headers: { host: "demo.emkaro.ru" },
    });
    assert.equal(verifySameOrigin(req), false);
  });
});
