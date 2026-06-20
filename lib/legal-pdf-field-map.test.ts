import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizePdfFieldName,
  resolveTokenForPdfField,
} from "@/lib/legal-pdf-field-map";

describe("normalizePdfFieldName", () => {
  it("strips braces and punctuation", () => {
    assert.equal(normalizePdfFieldName("{{patient.fullName}}"), "patientfullname");
    assert.equal(normalizePdfFieldName("ФИО"), "фио");
  });
});

describe("resolveTokenForPdfField", () => {
  const tokens = {
    "patient.fullName": "Иванов Иван",
    "clinic.name": "Стоматология",
  };

  it("matches exact token key", () => {
    assert.equal(resolveTokenForPdfField("patient.fullName", tokens), "Иванов Иван");
  });

  it("matches aliases", () => {
    assert.equal(resolveTokenForPdfField("fio", tokens), "Иванов Иван");
    assert.equal(resolveTokenForPdfField("клиника", tokens), "Стоматология");
  });

  it("returns null for unknown field", () => {
    assert.equal(resolveTokenForPdfField("unknown", tokens), null);
  });
});