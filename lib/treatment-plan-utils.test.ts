import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calcPlanTotals } from "./treatment-plan-utils";
import type { TreatmentPlanItem } from "./types";
import {
  findMatchingPlanItemIndex,
  normalizePlanItemQuantity,
  planItemLineTotal,
} from "./treatment-plan-item-utils";

describe("treatment plan item quantity", () => {
  const item: TreatmentPlanItem = {
    id: "tpi_1",
    serviceName: "Пломба",
    price: 5000,
    quantity: 3,
    status: "planned",
  };

  it("normalizes invalid quantity to 1", () => {
    assert.equal(normalizePlanItemQuantity(undefined), 1);
    assert.equal(normalizePlanItemQuantity(0), 1);
    assert.equal(normalizePlanItemQuantity(2.7), 2);
  });

  it("calculates line total with quantity", () => {
    assert.equal(planItemLineTotal(item), 15000);
  });

  it("calcPlanTotals sums quantity * price", () => {
    const { totalAmount } = calcPlanTotals([item], "percent", 0);
    assert.equal(totalAmount, 15000);
  });

  it("findMatchingPlanItemIndex matches same service without tooth", () => {
    const items: TreatmentPlanItem[] = [
      { ...item, id: "a", serviceId: "srv1" },
      { ...item, id: "b", serviceId: "srv2", toothNumber: 11 },
    ];
    assert.equal(findMatchingPlanItemIndex(items, "srv1"), 0);
    assert.equal(findMatchingPlanItemIndex(items, "srv2", 11), 1);
    assert.equal(findMatchingPlanItemIndex(items, "srv2"), -1);
  });
});
