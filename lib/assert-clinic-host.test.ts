import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import { assertClinicHost } from "./assert-clinic-host";
import type { SessionTokenPayload } from "./auth-session-token";
import { setTestEnv } from "./test-env";

function session(slug: string): SessionTokenPayload {
  return {
    userId: "u1",
    role: "owner",
    name: "Test",
    email: "t@example.com",
    clinicId: "c1",
    clinicSlug: slug,
    exp: Date.now() + 60_000,
  };
}

describe("assertClinicHost", () => {
  const prev = { ...process.env };

  afterEach(() => {
    setTestEnv(prev);
  });

  it("returns null when host slug matches session", () => {
    setTestEnv({ APP_ROOT_DOMAIN: "emkaro.ru" });
    const req = new Request("http://demo.emkaro.ru/api/clinic/data", {
      headers: { host: "demo.emkaro.ru" },
    });
    assert.equal(assertClinicHost(session("demo"), req), null);
  });

  it("returns 403 when host slug mismatches session", () => {
    setTestEnv({ APP_ROOT_DOMAIN: "emkaro.ru" });
    const req = new Request("http://other.emkaro.ru/api/clinic/data", {
      headers: { host: "other.emkaro.ru" },
    });
    const res = assertClinicHost(session("demo"), req);
    assert.ok(res);
    assert.equal(res.status, 403);
  });

  it("returns 403 when session has no clinicSlug", () => {
    const req = new Request("http://demo.emkaro.ru/api/clinic/data", {
      headers: { host: "demo.emkaro.ru" },
    });
    const noSlug = { ...session("demo"), clinicSlug: undefined };
    const res = assertClinicHost(noSlug, req);
    assert.ok(res);
    assert.equal(res.status, 403);
  });
});
