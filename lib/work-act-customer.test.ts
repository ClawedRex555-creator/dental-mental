import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getWorkActCustomerName, getWorkActCustomerPassport } from "./work-act-utils.ts";

describe("getWorkActCustomerName", () => {
  it("uses representative for child patient", () => {
    assert.equal(
      getWorkActCustomerName({
        firstName: "Маша",
        lastName: "Иванова",
        isChild: true,
        representativeFullName: "Иванов Иван Иванович",
      }),
      "Иванов Иван Иванович"
    );
  });

  it("uses patient name for adult", () => {
    assert.equal(
      getWorkActCustomerName({
        firstName: "Иван",
        lastName: "Иванов",
        middleName: "Иванович",
      }),
      "Иван Иванович Иванов"
    );
  });
});

describe("getWorkActCustomerPassport", () => {
  it("uses representative passport for child", () => {
    assert.equal(
      getWorkActCustomerPassport({
        isChild: true,
        passportSeries: "1111",
        passportNumber: "111111",
        representativePassportSeries: "6012",
        representativePassportNumber: "345678",
      }),
      "6012 345678"
    );
  });

  it("uses patient passport for adult", () => {
    assert.equal(
      getWorkActCustomerPassport({
        passportSeries: "6012",
        passportNumber: "345678",
      }),
      "6012 345678"
    );
  });
});
