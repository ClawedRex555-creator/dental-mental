import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyAddPatientNoteToPersistedState,
  applyCreatePrepaymentToPersistedState,
  applyDeletePatientNoteToPersistedState,
  applyDeleteTreatmentPlanCaseToPersistedState,
  applyDeleteTreatmentPlanToPersistedState,
  applyUpsertMedicalRecordToPersistedState,
  applyUpsertTreatmentPlanCaseToPersistedState,
  applyUpsertTreatmentPlanToPersistedState,
} from "./apply-entity-commands";
import { createFreshPersistedState } from "./clinic-persisted-state";
import type {
  MedicalRecord,
  PatientNote,
  TreatmentPlan,
  TreatmentPlanCase,
  WorkAct,
} from "./types";

function plan(partial?: Partial<TreatmentPlan>): TreatmentPlan {
  return {
    id: "tp1",
    patientId: "p1",
    doctorId: "d1",
    title: "План",
    items: [
      {
        id: "tpi1",
        serviceId: "s1",
        serviceName: "Чистка",
        price: 2000,
        quantity: 1,
        status: "planned",
      },
    ],
    totalAmount: 2000,
    discountType: "percent",
    discount: 0,
    finalAmount: 2000,
    status: "draft",
    createdAt: "2026-08-12",
    ...partial,
  };
}

describe("apply-entity-commands", () => {
  it("upserts treatment plan", () => {
    const state = createFreshPersistedState();
    const created = applyUpsertTreatmentPlanToPersistedState(state, plan());
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.state.treatmentPlans[0]?.title, "План");

    const updated = applyUpsertTreatmentPlanToPersistedState(created.state, plan({ title: "Новый" }));
    assert.equal(updated.ok, true);
    if (!updated.ok) return;
    assert.equal(updated.state.treatmentPlans[0]?.title, "Новый");
  });

  it("deletes treatment plan and linked note", () => {
    const state = createFreshPersistedState();
    state.treatmentPlans = [plan()];
    state.patientNotes = [
      {
        id: "pn_tp_tp1",
        patientId: "p1",
        author: "A",
        role: "admin",
        text: "x",
        sourceTreatmentPlanId: "tp1",
        createdAt: "2026-08-12",
      },
    ];
    const deleted = applyDeleteTreatmentPlanToPersistedState(state, "tp1");
    assert.equal(deleted.ok, true);
    if (!deleted.ok) return;
    assert.equal(deleted.state.treatmentPlans.length, 0);
    assert.equal(deleted.state.patientNotes.length, 0);
    assert.equal(deleted.state.deletedTreatmentPlanIds?.includes("tp1"), true);
  });

  it("groups plans into a case without merging items", () => {
    const state = createFreshPersistedState();
    state.treatmentPlans = [
      plan({ id: "tp1" }),
      plan({ id: "tp2", title: "План 2" }),
    ];
    const caseItem: TreatmentPlanCase = {
      id: "tpc1",
      patientId: "p1",
      title: "Комплекс",
      planIds: ["tp1", "tp2"],
      status: "in_progress",
      createdAt: "2026-08-12",
    };
    const created = applyUpsertTreatmentPlanCaseToPersistedState(state, caseItem);
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.state.treatmentPlanCases.length, 1);
    assert.equal(created.state.treatmentPlans[0]?.caseId, "tpc1");
    assert.equal(created.state.treatmentPlans[1]?.caseId, "tpc1");
    assert.equal(created.state.treatmentPlans[0]?.items.length, 1);

    const removed = applyDeleteTreatmentPlanCaseToPersistedState(created.state, "tpc1");
    assert.equal(removed.ok, true);
    if (!removed.ok) return;
    assert.equal(removed.state.treatmentPlanCases.length, 0);
    assert.equal(removed.state.treatmentPlans.length, 2);
    assert.equal(removed.state.treatmentPlans[0]?.caseId, undefined);
  });

  it("upserts medical record", () => {
    const state = createFreshPersistedState();
    const record: MedicalRecord = {
      id: "mr1",
      patientId: "p1",
      doctorId: "d1",
      complaints: "боль",
      anamnesis: "боль",
      lifeAnamnesis: "нет",
      objective: "ок",
      diagnosis: "K02",
      treatment: "лечение",
      createdAt: "2026-08-12",
      serviceName: "Приём",
    };
    const result = applyUpsertMedicalRecordToPersistedState(state, record);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.medicalRecords[0]?.id, "mr1");
  });

  it("adds and deletes patient notes", () => {
    const state = createFreshPersistedState();
    const note: PatientNote = {
      id: "n1",
      patientId: "p1",
      author: "Admin",
      role: "admin",
      text: "Важно",
      createdAt: "2026-08-12T10:00:00.000Z",
    };
    const added = applyAddPatientNoteToPersistedState(state, note);
    assert.equal(added.ok, true);
    if (!added.ok) return;
    const deleted = applyDeletePatientNoteToPersistedState(added.state, "n1");
    assert.equal(deleted.ok, true);
    if (!deleted.ok) return;
    assert.equal(deleted.state.patientNotes.length, 0);
  });

  it("creates prepayment with work act and invoice", () => {
    const state = createFreshPersistedState();
    const act: WorkAct = {
      id: "act1",
      actNumber: "",
      actDate: "2026-08-12",
      patientId: "p1",
      doctorId: "d1",
      items: [
        {
          id: "wai1",
          serviceName: "Чистка",
          quantity: 1,
          price: 1000,
          total: 1000,
        },
      ],
      subtotalAmount: 1000,
      discountType: "percent",
      discount: 0,
      totalAmount: 500,
      plannedTotalAmount: 1000,
      paymentStatus: "pending",
      createdAt: "2026-08-12",
      actType: "prepayment",
    };
    const result = applyCreatePrepaymentToPersistedState(state, {
      prepayment: {
        id: "prep1",
        patientId: "p1",
        items: [{ serviceName: "Чистка", price: 1000, quantity: 1 }],
        totalAmount: 1000,
        discountType: "percent",
        discount: 0,
        finalAmount: 1000,
        paidAmount: 500,
        remainingAmount: 500,
        date: "2026-08-12",
      },
      workAct: act,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.prepayments[0]?.id, "prep1");
    assert.equal(result.state.workActs[0]?.actType, "prepayment");
    assert.equal(result.state.invoices.length, 1);
    assert.ok(result.state.workActs[0]?.actNumber);
  });
});
