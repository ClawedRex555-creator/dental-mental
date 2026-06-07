import assert from "node:assert/strict";
import { describe, it } from "node:test";

/** Mirrors middleware.ts isServiceApi — external callbacks must bypass session cookie gate */
function isServiceApi(pathname: string): boolean {
  return (
    pathname.startsWith("/api/egisz/webhook") ||
    pathname.startsWith("/api/egisz/process")
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
});
