import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractDiagnosisCode } from "./diagnosis-code";
import { resolveNmuService } from "./nsi-display-names";

describe("extractDiagnosisCode", () => {
  it("uses NSI displayName for known MKB code", () => {
    assert.deepEqual(extractDiagnosisCode("K02.1 Кариес поверхностный"), {
      code: "K02.1",
      displayName: "Кариес дентина",
    });
  });

  it("defaults unknown text to Z01.2", () => {
    assert.equal(extractDiagnosisCode("Кариес").code, "Z01.2");
    assert.equal(extractDiagnosisCode("Кариес").displayName, "Стоматологическое обследование");
  });
});

describe("resolveNmuService", () => {
  const fallback = {
    fallbackCode: "B01.065.001",
    fallbackName: "Прием (осмотр, консультация) врача-стоматолога первичный",
  };

  it("maps hygiene name to A16.07.051 (not A11.07.010)", () => {
    assert.deepEqual(
      resolveNmuService({
        serviceCode: "B01.065.001",
        serviceName: "Профессиональная гигиена",
        ...fallback,
      }),
      {
        code: "A16.07.051",
        name: "Профессиональная гигиена полости рта и зубов",
      }
    );
  });

  it("keeps A11.07.010 with correct NSI name when code is set explicitly", () => {
    assert.deepEqual(
      resolveNmuService({
        serviceCode: "A11.07.010",
        serviceName: "Что угодно",
        ...fallback,
      }),
      {
        code: "A11.07.010",
        name: "Введение лекарственных препаратов в пародонтальный карман",
      }
    );
  });

  it("uses canonical name for known filling code from price list", () => {
    assert.deepEqual(
      resolveNmuService({
        serviceCode: "A16.07.002",
        serviceName: "Пломба",
        ...fallback,
      }),
      {
        code: "A16.07.002",
        name: "Восстановление зуба пломбой",
      }
    );
  });

  it("prefers explicit price-list code over conflicting free-text name", () => {
    assert.deepEqual(
      resolveNmuService({
        serviceCode: "A16.07.051",
        serviceName: "Air Flow / ультразвук",
        ...fallback,
      }),
      {
        code: "A16.07.051",
        name: "Профессиональная гигиена полости рта и зубов",
      }
    );
  });
});
