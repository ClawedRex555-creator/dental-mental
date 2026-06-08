import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isClientAuditAction,
  isValidAuditAction,
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
});
