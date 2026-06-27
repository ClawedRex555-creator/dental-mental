import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyWorkActItemsToTeeth,
  formatWorkActItemTreatmentLine,
  isValidFdiToothNumber,
} from "@/lib/work-act-teeth";
import type { ToothRecord, WorkActItem } from "@/lib/types";

const item = (overrides: Partial<WorkActItem>): WorkActItem => ({
  id: "w1",
  serviceName: "Лечение кариеса",
  quantity: 1,
  price: 5000,
  total: 5000,
  ...overrides,
});

describe("isValidFdiToothNumber", () => {
  it("accepts FDI teeth", () => {
    assert.equal(isValidFdiToothNumber(16), true);
    assert.equal(isValidFdiToothNumber(99), false);
  });
});

describe("applyWorkActItemsToTeeth", () => {
  it("adds completed treatment for tooth", () => {
    const teeth: ToothRecord[] = [];
    const next = applyWorkActItemsToTeeth(
      teeth,
      [item({ toothNumber: 16, serviceName: "Пломба" })],
      { actNumber: "5", actDate: "2026-06-27" }
    );
    const t16 = next.find((t) => t.toothNumber === 16);
    assert.ok(t16?.completedTreatment?.includes("Пломба"));
    assert.ok(t16?.completedTreatment?.includes("Акт №5"));
    assert.equal(t16?.status, "completed");
  });

  it("merges multiple services on same tooth", () => {
    const teeth: ToothRecord[] = [
      {
        toothNumber: 21,
        condition: "caries",
        completedTreatment: "Старое",
        status: "planned",
      },
    ];
    const next = applyWorkActItemsToTeeth(teeth, [
      item({ toothNumber: 21, serviceName: "Коронка" }),
    ]);
    const t21 = next.find((t) => t.toothNumber === 21)!;
    assert.match(t21.completedTreatment ?? "", /Старое/);
    assert.match(t21.completedTreatment ?? "", /Коронка/);
    assert.equal(t21.status, "completed");
  });

  it("ignores items without valid tooth", () => {
    const teeth: ToothRecord[] = [];
    const next = applyWorkActItemsToTeeth(teeth, [
      item({ toothNumber: undefined }),
      item({ toothNumber: 100 }),
    ]);
    assert.equal(next.length, 0);
  });
});

describe("formatWorkActItemTreatmentLine", () => {
  it("includes quantity when > 1", () => {
    assert.equal(
      formatWorkActItemTreatmentLine(item({ quantity: 2, serviceName: "Снимок" })),
      "Снимок ×2"
    );
  });
});
