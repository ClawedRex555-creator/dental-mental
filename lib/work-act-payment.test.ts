import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getWorkActPaidAmount,
  getWorkActRemainingAmount,
  isWorkActFullyPaid,
  resolvePatientBalanceAfterActPayment,
} from "@/lib/work-act-payment";
import type { Payment, WorkAct } from "@/lib/types";

const act: WorkAct = {
  id: "act-1",
  actNumber: "0001",
  actDate: "2026-06-27",
  patientId: "pat-1",
  items: [],
  subtotalAmount: 10000,
  discountType: "percent",
  discount: 0,
  totalAmount: 10000,
  paymentStatus: "pending",
  createdAt: "2026-06-27",
};

describe("work-act-payment", () => {
  it("sums paid amounts", () => {
    const payments: Payment[] = [
      {
        id: "p1",
        patientId: "pat-1",
        workActId: "act-1",
        amount: 3000,
        method: "cash",
        status: "paid",
        date: "2026-06-27",
      },
    ];
    assert.equal(getWorkActPaidAmount(payments, "act-1"), 3000);
    assert.equal(getWorkActRemainingAmount(act, payments), 7000);
    assert.equal(isWorkActFullyPaid(act, payments), false);
  });

  it("balance after partial then full payment", () => {
    let balance = 0;
    balance = resolvePatientBalanceAfterActPayment(balance, 10000, 0, 3000);
    assert.equal(balance, -7000);
    balance = resolvePatientBalanceAfterActPayment(balance, 10000, 3000, 7000);
    assert.equal(balance, 0);
  });
});
