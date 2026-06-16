import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AUDIT_METADATA_MAX_BYTES,
  isClientAuditAction,
  isValidAuditAction,
  isValidAuditMetadata,
  isValidAuditResourceId,
  isValidAuditResourceType,
} from "./audit-validation";

describe("audit validation", () => {
  it("accepts known client actions", () => {
    assert.equal(isClientAuditAction("view"), true);
    assert.equal(isClientAuditAction("export"), true);
  });

  it("rejects forged login/logout from client", () => {
    assert.equal(isClientAuditAction("login"), false);
    assert.equal(isClientAuditAction("logout"), false);
  });

  it("rejects unknown actions and resource types", () => {
    assert.equal(isValidAuditAction("admin"), false);
    assert.equal(isValidAuditResourceType("users"), false);
  });

  it("validates resourceId format", () => {
    assert.equal(isValidAuditResourceId("patient-abc123"), true);
    assert.equal(isValidAuditResourceId("bad id"), false);
    assert.equal(isValidAuditResourceId("x".repeat(129)), false);
  });

  it("limits metadata size", () => {
    assert.equal(isValidAuditMetadata({ a: 1 }), true);
    const big = { data: "x".repeat(AUDIT_METADATA_MAX_BYTES) };
    assert.equal(isValidAuditMetadata(big), false);
  });
});
