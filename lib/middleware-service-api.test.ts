import assert from "node:assert/strict";
import { describe, it } from "node:test";

/** Mirrors proxy.ts isPublicApi / isServiceApi */
function isPublicApi(pathname: string): boolean {
  return (
    pathname.startsWith("/api/auth/login") ||
    pathname.startsWith("/api/auth/logout") ||
    pathname.startsWith("/api/auth/me") ||
    pathname.startsWith("/api/clinic/context") ||
    pathname.startsWith("/api/platform/auth/login") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/api/internal/tls-ask")
  );
}

function isServiceApi(pathname: string): boolean {
  return (
    pathname.startsWith("/api/egisz/webhook") ||
    pathname.startsWith("/api/egisz/process") ||
    pathname.startsWith("/api/mobile/")
  );
}

describe("middleware service API bypass", () => {
  it("allows egisz webhook without session", () => {
    assert.equal(isServiceApi("/api/egisz/webhook"), true);
  });

  it("allows egisz process cron without session", () => {
    assert.equal(isServiceApi("/api/egisz/process"), true);
  });

  it("does not bypass protected clinic APIs", () => {
    assert.equal(isServiceApi("/api/clinic/data"), false);
    assert.equal(isServiceApi("/api/auth/accounts"), false);
  });

  it("allows tls-ask without session", () => {
    assert.equal(isPublicApi("/api/internal/tls-ask"), true);
  });

  it("allows mobile API without session cookie", () => {
    assert.equal(isServiceApi("/api/mobile/v1/health"), true);
    assert.equal(isServiceApi("/api/mobile/v1/auth/login"), true);
    assert.equal(isServiceApi("/api/mobile/v1/catalog"), true);
  });
});
