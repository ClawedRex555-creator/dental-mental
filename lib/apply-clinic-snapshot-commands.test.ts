import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyAssignStaffToCabinetToPersistedState,
  applyDeleteCabinetToPersistedState,
  applySetAssistantManualHoursToPersistedState,
  applySetPatientTeethToPersistedState,
  applyUpsertCabinetToPersistedState,
  applyUpsertClinicExpenseToPersistedState,
  applyUpsertPatientFileToPersistedState,
} from "./apply-clinic-snapshot-commands";
import { createFreshPersistedState } from "./clinic-persisted-state";

describe("apply-clinic-snapshot-commands", () => {
  it("upserts cabinet and updates existing cabinet", () => {
    const base = createFreshPersistedState();
    const add = applyUpsertCabinetToPersistedState(base, {
      id: "cab-1",
      name: "Кабинет 1",
      number: "101",
      equipment: [],
      staffIds: [],
      status: "active",
    });
    assert.equal(add.ok, true);
    if (!add.ok) return;
    assert.equal(add.state.cabinets.length, 1);

    const update = applyUpsertCabinetToPersistedState(add.state, {
      id: "cab-1",
      name: "Кабинет A",
      number: "102",
      equipment: [],
      staffIds: [],
      status: "active",
    });
    assert.equal(update.ok, true);
    if (!update.ok) return;
    assert.equal(update.state.cabinets[0]?.name, "Кабинет A");
    assert.equal(update.state.cabinets[0]?.number, "102");
  });

  it("assigns staff to cabinet and detaches from previous cabinet", () => {
    const base = createFreshPersistedState();
    const state = {
      ...base,
      doctors: [
        {
          id: "doc-1",
          name: "Доктор",
          specialization: "Терапия",
          phone: "",
          email: "",
          cabinet: "—",
          cabinetId: undefined,
          commissionPercent: 20,
          status: "active" as const,
          role: "doctor" as const,
        },
      ],
      cabinets: [
        {
          id: "cab-old",
          name: "Старый",
          number: "1",
          equipment: [],
          staffIds: ["doc-1"],
          status: "active" as const,
        },
        {
          id: "cab-new",
          name: "Новый",
          number: "2",
          equipment: [],
          staffIds: [],
          status: "active" as const,
        },
      ],
    };

    const assigned = applyAssignStaffToCabinetToPersistedState(state, "cab-new", "doc-1");
    assert.equal(assigned.ok, true);
    if (!assigned.ok) return;
    assert.equal(
      assigned.state.cabinets.find((c) => c.id === "cab-new")?.staffIds.includes("doc-1"),
      true
    );
    assert.equal(
      assigned.state.cabinets.find((c) => c.id === "cab-old")?.staffIds.includes("doc-1"),
      false
    );
    assert.equal(
      assigned.state.doctors.find((d) => d.id === "doc-1")?.cabinetId,
      "cab-new"
    );
  });

  it("deletes cabinet and clears doctor/appointment links", () => {
    const base = createFreshPersistedState();
    const state = {
      ...base,
      cabinets: [
        {
          id: "cab-1",
          name: "Кабинет 1",
          number: "101",
          equipment: [],
          staffIds: ["doc-1"],
          status: "active" as const,
        },
      ],
      doctors: [
        {
          id: "doc-1",
          name: "Доктор",
          specialization: "Терапия",
          phone: "",
          email: "",
          cabinet: "Кабинет 1",
          cabinetId: "cab-1",
          commissionPercent: 20,
          status: "active" as const,
          role: "doctor" as const,
        },
      ],
      appointments: [
        {
          id: "apt-1",
          patientId: "p1",
          doctorId: "doc-1",
          cabinetId: "cab-1",
          date: "2026-08-20",
          startTime: "10:00",
          endTime: "10:30",
          durationMinutes: 30,
          status: "scheduled" as const,
          price: 0,
          paymentStatus: "pending" as const,
        },
      ],
    };
    const removed = applyDeleteCabinetToPersistedState(state, "cab-1");
    assert.equal(removed.ok, true);
    if (!removed.ok) return;
    assert.equal(removed.state.cabinets.length, 0);
    assert.equal(removed.state.doctors[0]?.cabinetId, undefined);
    assert.equal(removed.state.appointments[0]?.cabinetId, undefined);
  });

  it("upserts expense and marks idempotent second save", () => {
    const base = createFreshPersistedState();
    const expense = {
      id: "exp-1",
      date: "2026-08-20",
      category: "Аренда",
      amount: 10000,
      description: "Офис",
    };
    const first = applyUpsertClinicExpenseToPersistedState(base, expense);
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.state.clinicExpenses.length, 1);

    const second = applyUpsertClinicExpenseToPersistedState(first.state, expense);
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.alreadyApplied, true);
  });

  it("sets and clears assistant manual hours", () => {
    const base = createFreshPersistedState();
    const first = applySetAssistantManualHoursToPersistedState(base, {
      assistantId: "as-1",
      date: "2026-08-20",
      hours: "6",
    });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.state.assistantManualHours["as-1"]?.["2026-08-20"], "6");

    const cleared = applySetAssistantManualHoursToPersistedState(first.state, {
      assistantId: "as-1",
      date: "2026-08-20",
      hours: "",
    });
    assert.equal(cleared.ok, true);
    if (!cleared.ok) return;
    assert.equal(cleared.state.assistantManualHours["as-1"], undefined);
  });

  it("upserts patient file and updates teeth map", () => {
    const base = createFreshPersistedState();
    const fileResult = applyUpsertPatientFileToPersistedState(base, {
      id: "pf-1",
      patientId: "p1",
      name: "scan.pdf",
      type: "document",
      uploadedAt: "2026-08-20",
      dataUrl: "data:application/pdf;base64,AAAA",
    });
    assert.equal(fileResult.ok, true);
    if (!fileResult.ok) return;
    assert.equal(fileResult.state.patientFiles.length, 1);

    const teethResult = applySetPatientTeethToPersistedState(fileResult.state, {
      patientId: "p1",
      teeth: [
        {
          toothNumber: 11,
          condition: "healthy",
        },
      ],
    });
    assert.equal(teethResult.ok, true);
    if (!teethResult.ok) return;
    assert.equal(teethResult.state.teethByPatient["p1"]?.[0]?.toothNumber, 11);
  });
});
