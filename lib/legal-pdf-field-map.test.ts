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
    assert.equal(resolveTokenForPdfField("customer.fullName", tokens), null);
  });

  it("matches underscore Word field names", () => {
    assert.equal(resolveTokenForPdfField("patient_full_name", tokens), "Иванов Иван");
    assert.equal(resolveTokenForPdfField("clinic_name", tokens), "Стоматология");
  });

  it("matches customer alias for child contract", () => {
    const childTokens = {
      "customer.fullName": "Иванов Иван Иванович",
      "patient.fullName": "Иванова Маша",
    };
    assert.equal(resolveTokenForPdfField("заказчик", childTokens), "Иванов Иван Иванович");
    assert.equal(
      resolveTokenForPdfField("customer_full_name", childTokens),
      "Иванов Иван Иванович"
    );
  });

  it("returns null for unknown field", () => {
    assert.equal(resolveTokenForPdfField("unknown", tokens), null);
  });
});