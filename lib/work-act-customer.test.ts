import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getWorkActCustomerName } from "./work-act-utils.ts";

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
