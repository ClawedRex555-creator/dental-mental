import { describe, expect, it } from "vitest";
import {
  getPatientDebtAmount,
  parseDebtInput,
  resolveBalanceFromDebt,
} from "./patient-balance";

describe("patient-balance", () => {
  it("getPatientDebtAmount", () => {
    expect(getPatientDebtAmount(-5000)).toBe(5000);
    expect(getPatientDebtAmount(100)).toBe(0);
    expect(getPatientDebtAmount(0)).toBe(0);
  });

  it("parseDebtInput", () => {
    expect(parseDebtInput("12 500")).toBe(12500);
    expect(parseDebtInput("")).toBe(0);
    expect(parseDebtInput("abc")).toBe(0);
  });

  it("resolveBalanceFromDebt sets negative balance for debt", () => {
    expect(resolveBalanceFromDebt("debtor", 3000, 0)).toEqual({
      balance: -3000,
      status: "debtor",
    });
  });

  it("resolveBalanceFromDebt pays off and clears debtor status", () => {
    expect(resolveBalanceFromDebt("debtor", 0, -3000)).toEqual({
      balance: 0,
      status: "active",
    });
  });

  it("resolveBalanceFromDebt nets credit and debt", () => {
    expect(resolveBalanceFromDebt("debtor", 3000, 5000)).toEqual({
      balance: 2000,
      status: "active",
    });
  });
});
