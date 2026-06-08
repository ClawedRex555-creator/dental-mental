import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { safeRedirectPath } from "./safe-redirect";

describe("safeRedirectPath", () => {
  it("allows internal paths", () => {
    assert.equal(safeRedirectPath("/appointments"), "/appointments");
    assert.equal(safeRedirectPath("/patients/abc"), "/patients/abc");
  });

  it("blocks open redirects", () => {
    assert.equal(safeRedirectPath("https://evil.test"), "/appointments");
    assert.equal(safeRedirectPath("//evil.test"), "/appointments");
    assert.equal(safeRedirectPath("/\\evil"), "/appointments");
  });

  it("avoids redirect back to login", () => {
    assert.equal(safeRedirectPath("/login"), "/appointments");
    assert.equal(safeRedirectPath("/login?from=x"), "/appointments");
  });
});
