import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractDiagnosisCode } from "./diagnosis-code";

describe("extractDiagnosisCode", () => {
  it("parses MKB prefix from diagnosis text", () => {
    assert.deepEqual(extractDiagnosisCode("K02.1 Кариес поверхностный"), {
      code: "K02.1",
      displayName: "K02.1 Кариес поверхностный",
    });
  });

  it("falls back to Z01.2 when code missing", () => {
    assert.equal(extractDiagnosisCode("Кариес").code, "Z01.2");
  });
});
