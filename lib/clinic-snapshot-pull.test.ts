import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFreshPersistedState } from "./clinic-persisted-state";
import { mergeRemoteSnapshotForPull } from "./clinic-snapshot-load";
import type { Appointment, LegalDocument, WorkAct } from "./types";

describe("mergeRemoteSnapshotForPull", () => {
  it("keeps server work acts when local snapshot is stale and there are no unsaved edits", () => {
    const base = createFreshPersistedState();
    const serverAct: WorkAct = {
      id: "wa-server",
      patientId: "p1",
      doctorId: "d1",
      actDate: "2026-07-01",
      actNumber: "0001",
      actType: "service",
      items: [],
      totalAmount: 5000,
      paymentStatus: "paid",
    };
    const remote = { ...base, workActs: [serverAct] };
    const local = { ...base, workActs: [] };

    const merged = mergeRemoteSnapshotForPull(remote, local, false);
    assert.equal(merged.workActs.length, 1);
    assert.equal(merged.workActs[0]?.id, "wa-server");
  });

  it("merges local edits with server when there are unsaved changes", () => {
    const base = createFreshPersistedState();
    const serverAct: WorkAct = {
      id: "wa-server",
      patientId: "p1",
      doctorId: "d1",
      actDate: "2026-07-01",
      actNumber: "0001",
      actType: "service",
      items: [],
      totalAmount: 5000,
      paymentStatus: "paid",
    };
    const localAct: WorkAct = {
      ...serverAct,
      id: "wa-local",
      actNumber: "0002",
      patientId: "p2",
      paymentStatus: "pending",
    };
    const remote = { ...base, workActs: [serverAct] };
    const local = { ...base, workActs: [serverAct, localAct] };

    const merged = mergeRemoteSnapshotForPull(remote, local, true);
    assert.equal(merged.workActs.some((a) => a.id === "wa-server"), true);
    assert.equal(merged.workActs.some((a) => a.id === "wa-local"), true);
  });

  it("keeps server appointments when local snapshot is stale and there are no unsaved edits", () => {
    const base = createFreshPersistedState();
    const serverApt: Appointment = {
      id: "apt-server",
      patientId: "p1",
      doctorId: "d1",
      date: "2026-07-08",
      startTime: "10:00",
      endTime: "11:00",
      durationMinutes: 60,
      status: "scheduled",
      price: 0,
      paymentStatus: "pending",
    };
    const remote = { ...base, appointments: [serverApt] };
    const local = { ...base, appointments: [] };

    const merged = mergeRemoteSnapshotForPull(remote, local, false);
    assert.equal(merged.appointments.length, 1);
    assert.equal(merged.appointments[0]?.id, "apt-server");
  });

  it("merges stale local appointments with server without dropping server-only rows", () => {
    const base = createFreshPersistedState();
    const serverApt: Appointment = {
      id: "apt-server",
      patientId: "p1",
      doctorId: "d1",
      date: "2026-07-08",
      startTime: "10:00",
      endTime: "11:00",
      durationMinutes: 60,
      status: "scheduled",
      price: 0,
      paymentStatus: "pending",
    };
    const saturdayApt: Appointment = {
      ...serverApt,
      id: "apt-sat",
      date: "2026-07-11",
      startTime: "14:00",
      endTime: "15:00",
    };
    const remote = { ...base, appointments: [serverApt, saturdayApt] };
    const local = { ...base, appointments: [serverApt] };

    const merged = mergeRemoteSnapshotForPull(remote, local, true);
    assert.equal(merged.appointments.length, 2);
    assert.equal(merged.appointments.some((a) => a.id === "apt-sat"), true);
  });

  it("does not resurrect work act deleted locally after save when server snapshot is stale", () => {
    const base = createFreshPersistedState();
    const serverAct: WorkAct = {
      id: "wa-deleted",
      patientId: "p1",
      doctorId: "d1",
      actDate: "2026-07-01",
      actNumber: "0001",
      actType: "service",
      items: [],
      totalAmount: 5000,
      paymentStatus: "paid",
    };
    const remote = { ...base, workActs: [serverAct] };
    const local = {
      ...base,
      workActs: [],
      deletedWorkActIds: ["wa-deleted"],
    };

    const merged = mergeRemoteSnapshotForPull(remote, local, false);
    assert.equal(merged.workActs.length, 0);
    assert.equal(merged.deletedWorkActIds?.includes("wa-deleted"), true);
  });

  it("does not resurrect deleted work act during unsaved merge with server", () => {
    const base = createFreshPersistedState();
    const serverAct: WorkAct = {
      id: "wa-deleted",
      patientId: "p1",
      doctorId: "d1",
      actDate: "2026-07-01",
      actNumber: "0001",
      actType: "service",
      items: [],
      totalAmount: 5000,
      paymentStatus: "paid",
    };
    const remote = { ...base, workActs: [serverAct] };
    const local = {
      ...base,
      workActs: [],
      deletedWorkActIds: ["wa-deleted"],
    };

    const merged = mergeRemoteSnapshotForPull(remote, local, true);
    assert.equal(merged.workActs.length, 0);
  });

  it("does not resurrect legal document deleted locally on fast pull", () => {
    const base = createFreshPersistedState();
    const legalDoc: LegalDocument = {
      id: "ld-1",
      category: "consent",
      title: "Информированное согласие",
      date: "2026-07-01",
    };
    const remote = {
      ...base,
      legalDocuments: [legalDoc],
      deletedLegalDocumentIds: [],
    };
    const local = {
      ...base,
      legalDocuments: [],
      deletedLegalDocumentIds: ["ld-1"],
    };

    const merged = mergeRemoteSnapshotForPull(remote, local, false);
    assert.equal(merged.legalDocuments.length, 0);
    assert.equal(merged.deletedLegalDocumentIds?.includes("ld-1"), true);
  });

  it("clears appointment workActId when act was deleted locally", () => {
    const base = createFreshPersistedState();
    const serverAct: WorkAct = {
      id: "wa-deleted",
      patientId: "p1",
      doctorId: "d1",
      actDate: "2026-07-01",
      actNumber: "0068-07/2026",
      actType: "service",
      items: [],
      totalAmount: 5000,
      paymentStatus: "paid",
      appointmentId: "apt-1",
    };
    const remote = {
      ...base,
      workActs: [serverAct],
      appointments: [
        {
          id: "apt-1",
          patientId: "p1",
          doctorId: "d1",
          date: "2026-07-01",
          startTime: "14:00",
          endTime: "15:00",
          durationMinutes: 60,
          status: "completed" as const,
          price: 5000,
          paymentStatus: "paid" as const,
          workActId: "wa-deleted",
        },
      ],
    };
    const local = {
      ...base,
      workActs: [],
      deletedWorkActIds: ["wa-deleted"],
      appointments: [
        {
          id: "apt-1",
          patientId: "p1",
          doctorId: "d1",
          date: "2026-07-01",
          startTime: "14:00",
          endTime: "15:00",
          durationMinutes: 60,
          status: "completed" as const,
          price: 5000,
          paymentStatus: "pending" as const,
        },
      ],
    };

    const merged = mergeRemoteSnapshotForPull(remote, local, false);
    assert.equal(merged.workActs.length, 0);
    assert.equal(merged.appointments[0]?.workActId, undefined);
    assert.equal(merged.appointments[0]?.paymentStatus, "pending");
  });
});
