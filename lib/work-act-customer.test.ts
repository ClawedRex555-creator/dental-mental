import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getWorkActCustomerName, getWorkActCustomerPassport, getPatientOrRepresentativeFullName, getPatientOrRepresentativePassport, getLegalRepresentativeFullName, getLegalRepresentativePassport, getLegalRepresentativeBirthDate } from "./work-act-utils";

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

describe("getPatientOrRepresentativeFullName", () => {
  it("uses representative for child", () => {
    assert.equal(
      getPatientOrRepresentativeFullName({
        firstName: "Маша",
        lastName: "Иванова",
        middleName: "Сергеевна",
        isChild: true,
        representativeFullName: "Иванов Иван Иванович",
      }),
      "Иванов Иван Иванович"
    );
  });

  it("uses patient full name for adult", () => {
    assert.equal(
      getPatientOrRepresentativeFullName({
        firstName: "Иван",
        lastName: "Иванов",
        middleName: "Иванович",
      }),
      "Иванов Иван Иванович"
    );
  });
});

describe("getLegalRepresentativeFullName", () => {
  it("returns representative only for child", () => {
    assert.equal(
      getLegalRepresentativeFullName({
        isChild: true,
        representativeFullName: "Иванов Иван Иванович",
      }),
      "Иванов Иван Иванович"
    );
  });

  it("returns empty for adult even if representative name stored", () => {
    assert.equal(
      getLegalRepresentativeFullName({
        isChild: false,
        representativeFullName: "Иванов Иван Иванович",
      }),
      ""
    );
  });
});

describe("getLegalRepresentativePassport", () => {
  it("returns empty for adult", () => {
    assert.equal(
      getLegalRepresentativePassport({
        isChild: false,
        representativePassportSeries: "6012",
        representativePassportNumber: "345678",
      }),
      ""
    );
  });
});

describe("getLegalRepresentativeBirthDate", () => {
  it("returns empty for adult", () => {
    assert.equal(getLegalRepresentativeBirthDate({ isChild: false, representativeBirthDate: "1985-03-15" }), "");
  });
});
