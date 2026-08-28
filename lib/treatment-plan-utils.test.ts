import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calcPlanLinkedPaymentSummary,
  calcPlanRemaining,
  calcPlanTotals,
  groupPlanItemsByStage,
  groupPlanItemsInArrayOrder,
  prioritizePlanStageGroups,
  resolvePlanItemsDoctorId,
} from "./treatment-plan-utils";
import { mergeCasePlanIds } from "./treatment-plan-case-utils";
import type { TreatmentPlanItem } from "./types";
import {
  findMatchingPlanItemIndex,
  insertPlanItemAtStageTop,
  movePlanItemToGlobalTop,
  movePlanItemToStageTop,
  normalizePlanItemQuantity,
  planItemLineTotal,
  prependPlanItem,
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

  it("prependPlanItem puts new row first and lifts its stage group", () => {
    const items: TreatmentPlanItem[] = [
      { ...item, id: "a", stage: "Ортодонтия" },
      { ...item, id: "b", stage: "Ортопедия" },
    ];
    const next = prependPlanItem(items, {
      ...item,
      id: "new",
      stage: "Ортопедия",
    });
    assert.deepEqual(
      next.map((it) => it.id),
      ["new", "a", "b"]
    );
    const groups = groupPlanItemsByStage(next);
    assert.equal(groups[0]?.stage, "Ортопедия");
    assert.equal(groups[0]?.items[0]?.id, "new");
  });

  it("insertPlanItemAtStageTop adds to start of stage block", () => {
    const items: TreatmentPlanItem[] = [
      { ...item, id: "a", stage: "Терапия" },
      { ...item, id: "b", stage: "Хирургия" },
      { ...item, id: "c", stage: "Терапия" },
    ];
    const next = insertPlanItemAtStageTop(items, {
      ...item,
      id: "new",
      stage: "Терапия",
    });
    assert.deepEqual(
      next.map((it) => it.id),
      ["new", "a", "c", "b"]
    );
  });

  it("movePlanItemToStageTop reorders within stage", () => {
    const items: TreatmentPlanItem[] = [
      { ...item, id: "a", stage: "Терапия" },
      { ...item, id: "b", stage: "Хирургия" },
      { ...item, id: "c", stage: "Терапия" },
    ];
    const next = movePlanItemToStageTop(items, "c");
    assert.deepEqual(
      next.map((it) => it.id),
      ["c", "a", "b"]
    );
  });
});

describe("calcPlanRemaining", () => {
  const items: TreatmentPlanItem[] = [
    {
      id: "a",
      serviceName: "A",
      price: 1000,
      quantity: 1,
      status: "completed",
    },
    {
      id: "b",
      serviceName: "B",
      price: 3000,
      quantity: 1,
      status: "planned",
    },
  ];

  it("applies discount proportionally to open items", () => {
    const result = calcPlanRemaining(items, "percent", 10);
    assert.equal(result.totalAmount, 4000);
    assert.equal(result.finalAmount, 3600);
    assert.equal(result.openSubtotal, 3000);
    assert.equal(result.completedSubtotal, 1000);
    assert.equal(result.remainingAmount, 2700);
  });
});

describe("groupPlanItemsByStage", () => {
  it("groups by stage preserving order", () => {
    const items: TreatmentPlanItem[] = [
      {
        id: "1",
        serviceName: "x",
        price: 100,
        status: "planned",
        stage: "Хирургия",
      },
      {
        id: "2",
        serviceName: "y",
        price: 200,
        status: "planned",
        stage: "Терапия",
      },
      {
        id: "3",
        serviceName: "z",
        price: 50,
        status: "planned",
        stage: "Хирургия",
      },
    ];
    const groups = groupPlanItemsByStage(items);
    assert.equal(groups.length, 2);
    assert.equal(groups[0]?.stage, "Хирургия");
    assert.equal(groups[0]?.items.length, 2);
    assert.equal(groups[0]?.subtotal, 150);
    assert.equal(groups[1]?.stage, "Терапия");
  });

  it("exposes shared stage doctorId", () => {
    const items: TreatmentPlanItem[] = [
      {
        id: "1",
        serviceName: "x",
        price: 100,
        status: "planned",
        stage: "Ортопедия",
        doctorId: "d1",
      },
      {
        id: "2",
        serviceName: "y",
        price: 200,
        status: "planned",
        stage: "Ортопедия",
        doctorId: "d1",
      },
    ];
    const [group] = groupPlanItemsByStage(items);
    assert.equal(group?.doctorId, "d1");
  });

  it("prioritizePlanStageGroups moves active stage first", () => {
    const groups = groupPlanItemsByStage([
      { id: "1", serviceName: "a", price: 1, status: "planned", stage: "A" },
      { id: "2", serviceName: "b", price: 1, status: "planned", stage: "B" },
    ]);
    const ordered = prioritizePlanStageGroups(groups, "B");
    assert.equal(ordered[0]?.stage, "B");
    assert.equal(ordered[1]?.stage, "A");
  });

  it("groupPlanItemsInArrayOrder keeps prepend at top under search", () => {
    const items: TreatmentPlanItem[] = [
      { id: "new", serviceName: "скан", price: 3000, status: "planned", stage: "Ортопедия" },
      { id: "a", serviceName: "брекет", price: 6500, status: "planned", stage: "Ортодонтия" },
      { id: "b", serviceName: "старое", price: 1000, status: "planned", stage: "Ортопедия" },
    ];
    const runs = groupPlanItemsInArrayOrder(items);
    assert.equal(runs.length, 3);
    assert.equal(runs[0]?.stage, "Ортопедия");
    assert.equal(runs[0]?.items[0]?.id, "new");
    assert.equal(runs[2]?.items[0]?.id, "b");
  });
});

describe("resolvePlanItemsDoctorId", () => {
  it("uses shared item doctor or falls back to plan doctor", () => {
    const items: TreatmentPlanItem[] = [
      {
        id: "1",
        serviceName: "x",
        price: 1,
        status: "planned",
        doctorId: "d2",
      },
      {
        id: "2",
        serviceName: "y",
        price: 1,
        status: "planned",
        doctorId: "d2",
      },
    ];
    assert.equal(resolvePlanItemsDoctorId(items, "d1"), "d2");
    assert.equal(
      resolvePlanItemsDoctorId(
        items.map((it) => ({ ...it, doctorId: undefined })),
        "d1"
      ),
      "d1"
    );
  });
});

describe("mergeCasePlanIds", () => {
  it("merges without duplicates and supports remove", () => {
    assert.deepEqual(mergeCasePlanIds(["a", "b"], ["b", "c"]), ["a", "b", "c"]);
    assert.deepEqual(mergeCasePlanIds(["a", "b", "c"], [], ["b"]), ["a", "c"]);
  });
});

describe("calcPlanLinkedPaymentSummary", () => {
  it("sums paid and unpaid linked acts", () => {
    const items: TreatmentPlanItem[] = [
      {
        id: "1",
        serviceName: "A",
        price: 5000,
        status: "completed",
        completedWorkActId: "act1",
      },
      {
        id: "2",
        serviceName: "B",
        price: 3000,
        status: "planned",
      },
    ];
    const summary = calcPlanLinkedPaymentSummary(
      items,
      [
        {
          id: "act1",
          actNumber: "1",
          actDate: "2026-08-01",
          patientId: "p1",
          items: [],
          subtotalAmount: 5000,
          discountType: "percent",
          discount: 0,
          totalAmount: 5000,
          paymentStatus: "pending",
          createdAt: "2026-08-01",
        },
      ],
      [
        {
          id: "pay1",
          patientId: "p1",
          workActId: "act1",
          amount: 2000,
          method: "cash",
          status: "paid",
          date: "2026-08-01",
        },
      ],
      "percent",
      0
    );
    assert.equal(summary.paidAmount, 2000);
    assert.equal(summary.unpaidAmount, 3000);
    assert.equal(summary.remainingAmount, 3000);
  });
});

