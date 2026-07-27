import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allocateNextActSequence,
  ensureUniqueWorkActNumbers,
  formatWorkActNumber,
  parseActSequenceNumber,
} from "./work-act-number";
import type { WorkAct } from "./types";

function act(partial: Partial<WorkAct> & Pick<WorkAct, "id" | "actNumber">): WorkAct {
  return {
    patientId: "p1",
    doctorId: "d1",
    actDate: "2026-07-25",
    createdAt: "2026-07-25T10:00:00.000Z",
    items: [],
    subtotalAmount: 1000,
    discountType: "percent",
    discount: 0,
    totalAmount: 1000,
    paymentStatus: "pending",
    ...partial,
  };
}

describe("work-act-number", () => {
  it("parses sequence from work act and prepayment numbers", () => {
    assert.equal(parseActSequenceNumber("0095-07/2026"), 95);
    assert.equal(parseActSequenceNumber("ПР-0096-07/2026"), 96);
    assert.equal(parseActSequenceNumber("12"), 12);
  });

  it("allocates next sequence after max of counter and existing acts", () => {
    assert.equal(
      allocateNextActSequence(
        [act({ id: "a1", actNumber: "0095-07/2026" })],
        [
          {
            id: "pr1",
            patientId: "p1",
            items: [],
            totalAmount: 1,
            paidAmount: 1,
            remainingAmount: 0,
            date: "2026-07-25",
            actNumber: "ПР-0097-07/2026",
          },
        ],
        90
      ),
      98
    );
  });

  it("formats padded month/year number", () => {
    assert.equal(formatWorkActNumber(95, new Date("2026-07-15T12:00:00")), "0095-07/2026");
  });

  it("renumbers duplicate act numbers keeping paid and earlier act", () => {
    const paid = act({
      id: "wa-paid",
      actNumber: "0095-07/2026",
      paymentStatus: "paid",
      createdAt: "2026-07-25T11:00:00.000Z",
    });
    const later = act({
      id: "wa-later",
      actNumber: "0095-07/2026",
      paymentStatus: "pending",
      createdAt: "2026-07-25T13:00:00.000Z",
      patientId: "p2",
    });

    const result = ensureUniqueWorkActNumbers({
      workActs: [later, paid],
      actCounter: 96,
      preferKeepIds: new Set(["wa-paid"]),
    });

    assert.equal(result.renumbered.length, 1);
    assert.equal(result.renumbered[0]?.id, "wa-later");
    assert.equal(result.workActs.find((a) => a.id === "wa-paid")?.actNumber, "0095-07/2026");
    assert.equal(result.workActs.find((a) => a.id === "wa-later")?.actNumber, "0096-07/2026");
    assert.equal(result.actCounter, 97);
  });

  it("updates invoice description when act is renumbered", () => {
    const a1 = act({ id: "wa1", actNumber: "0095-07/2026", paymentStatus: "paid" });
    const a2 = act({
      id: "wa2",
      actNumber: "0095-07/2026",
      patientId: "p2",
      createdAt: "2026-07-25T14:00:00.000Z",
    });
    const result = ensureUniqueWorkActNumbers({
      workActs: [a1, a2],
      invoices: [
        {
          id: "inv2",
          patientId: "p2",
          workActId: "wa2",
          amount: 1000,
          paid: 0,
          status: "pending",
          date: "2026-07-25",
          description: "Счёт по акту 0095-07/2026 от 2026-07-25",
        },
      ],
      actCounter: 96,
      preferKeepIds: new Set(["wa1"]),
    });
    const inv = result.invoices[0]!;
    assert.equal(inv.description.includes("0095-07/2026"), false);
    assert.match(inv.description, /0096-07\/2026/);
  });
});
