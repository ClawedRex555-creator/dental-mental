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

  it("matches short Word field names (≤20 chars)", () => {
    const childTokens = {
      "patient.representativeFullName": "Иванов Иван",
      "patient.representativePassport": "6012 345678",
      "patient.birthCertificate": "IV-АА 123456",
      "patient.contractNumber": "1234-5678",
    };
    assert.equal(resolveTokenForPdfField("patient_repr_fio", childTokens), "Иванов Иван");
    assert.equal(resolveTokenForPdfField("patient_repr_pass", childTokens), "6012 345678");
    assert.equal(resolveTokenForPdfField("patient_birth_cert", childTokens), "IV-АА 123456");
    assert.equal(resolveTokenForPdfField("patient_contract_no", childTokens), "1234-5678");
  });

  it("still matches legacy long Word field names", () => {
    const childTokens = {
      "patient.representativeFullName": "Иванов Иван",
    };
    assert.equal(
      resolveTokenForPdfField("patient_representative_full_name", childTokens),
      "Иванов Иван"
    );
  });

  it("matches customer passport alias", () => {
    const tokens = {
      "customer.passport": "6012 345678",
      "patient.passport": "1111 222222",
    };
    assert.equal(resolveTokenForPdfField("customer_passport", tokens), "6012 345678");
    assert.equal(resolveTokenForPdfField("паспортзаказчика", tokens), "6012 345678");
  });

  it("matches patient or representative aliases", () => {
    const childTokens = {
      "patientOrRepresentative.fullName": "Иванов Иван Иванович",
      "patientOrRepresentative.passport": "6012 345678",
      "patient.fullName": "Иванова Маша",
    };
    assert.equal(
      resolveTokenForPdfField("patient_or_repr_fio", childTokens),
      "Иванов Иван Иванович"
    );
    assert.equal(
      resolveTokenForPdfField("patient_or_repr_pass", childTokens),
      "6012 345678"
    );
  });

  it("returns null for unknown field", () => {
    assert.equal(resolveTokenForPdfField("unknown", tokens), null);
  });
});