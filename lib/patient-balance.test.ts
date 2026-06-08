import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getPatientDebtAmount,
  parseDebtInput,
  resolveBalanceFromDebt,
} from "./patient-balance";

describe("patient-balance", () => {
  it("getPatientDebtAmount", () => {
    assert.equal(getPatientDebtAmount(-5000), 5000);
    assert.equal(getPatientDebtAmount(100), 0);
    assert.equal(getPatientDebtAmount(0), 0);
  });

  it("parseDebtInput", () => {
    assert.equal(parseDebtInput("12 500"), 12500);
    assert.equal(parseDebtInput(""), 0);
    assert.equal(parseDebtInput("abc"), 0);
  });

  it("resolveBalanceFromDebt sets negative balance for debt", () => {
    assert.deepEqual(resolveBalanceFromDebt("debtor", 3000, 0), {
      balance: -3000,
      status: "debtor",
    });
  });

  it("resolveBalanceFromDebt pays off and clears debtor status", () => {
    assert.deepEqual(resolveBalanceFromDebt("debtor", 0, -3000), {
      balance: 0,
      status: "active",
    });
  });

  it("resolveBalanceFromDebt nets credit and debt", () => {
    assert.deepEqual(resolveBalanceFromDebt("debtor", 3000, 5000), {
      balance: 2000,
      status: "active",
    });
  });
});
