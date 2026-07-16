import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createFreshPersistedState,
  hasSnapshotRecoveryFromMerge,
  isSuspiciousClinicDataDowngrade,
  mergeClinicDataForSave,
  mergeClinicSnapshotWithLocal,
  repairFinancialCoupling,
  shouldPushMergedSnapshotAfterLoad,
  shouldRejectEmptyClinicOverwrite,
} from "./clinic-persisted-state";
import type { Patient } from "./types";

function patient(id: string): Patient {
  return {
    id,
    firstName: "A",
    lastName: "B",
    phone: "+79000000000",
    birthDate: "1990-01-01",
    gender: "male",
    source: "Google",
    createdAt: "2024-01-01",
    balance: 0,
    totalSpent: 0,
    disability: "none",
    status: "active",
  };
}

describe("isSuspiciousClinicDataDowngrade", () => {
  it("allows deleting one patient from a list", () => {
    const existing = createFreshPersistedState();
    existing.patients = [patient("p1"), patient("p2"), patient("p3")];
    existing.doctors = [{ id: "d1", name: "Doc", specialization: "T", phone: "", email: "", cabinet: "—", commissionPercent: 0, status: "active", role: "doctor" }];

    const incoming = { ...existing, patients: [patient("p1"), patient("p3")] };
    assert.equal(isSuspiciousClinicDataDowngrade(existing, incoming), false);
  });

  it("allows deleting the last patient", () => {
    const existing = createFreshPersistedState();
    existing.patients = [patient("p1")];
    existing.doctors = [{ id: "d1", name: "Doc", specialization: "T", phone: "", email: "", cabinet: "—", commissionPercent: 0, status: "active", role: "doctor" }];

    const incoming = { ...existing, patients: [] };
    assert.equal(isSuspiciousClinicDataDowngrade(existing, incoming), false);
  });

  it("allows save when local has fewer services than server (subset)", () => {
    const existing = createFreshPersistedState();
    existing.services = Array.from({ length: 10 }, (_, i) => ({
      id: `s${i}`,
      name: `S${i}`,
      category: "Терапия",
      price: 1000,
    }));
    existing.patients = [patient("p1")];
    existing.doctors = [{ id: "d1", name: "Doc", specialization: "T", phone: "", email: "", cabinet: "—", commissionPercent: 0, status: "active", role: "doctor" }];

    const incoming = {
      ...existing,
      services: existing.services.slice(0, 3),
    };
    assert.equal(isSuspiciousClinicDataDowngrade(existing, incoming), false);
  });

  it("rejects snapshot with unknown patient ids", () => {
    const existing = createFreshPersistedState();
    existing.patients = [patient("p1")];
    existing.doctors = [{ id: "d1", name: "Doc", specialization: "T", phone: "", email: "", cabinet: "—", commissionPercent: 0, status: "active", role: "doctor" }];

    const incoming = { ...existing, patients: [patient("other")] };
    assert.equal(isSuspiciousClinicDataDowngrade(existing, incoming), true);
  });

  it("rejects accidental loss of half the appointments (subset)", () => {
    const existing = createFreshPersistedState();
    existing.appointments = Array.from({ length: 8 }, (_, i) => ({
      id: `a${i}`,
      patientId: "p1",
      doctorId: "d1",
      cabinetId: "c1",
      date: "2026-01-01",
      startTime: "10:00",
      endTime: "10:30",
      durationMinutes: 30,
      status: "scheduled" as const,
      price: 0,
      paymentStatus: "pending" as const,
    }));
    existing.patients = [patient("p1")];
    existing.doctors = [{ id: "d1", name: "Doc", specialization: "T", phone: "", email: "", cabinet: "—", commissionPercent: 0, status: "active", role: "doctor" }];

    const incoming = { ...existing, appointments: existing.appointments.slice(0, 2) };
    assert.equal(isSuspiciousClinicDataDowngrade(existing, incoming), true);
  });

  it("rejects save when patients removed but appointments remain", () => {
    const existing = createFreshPersistedState();
    existing.patients = [patient("p1")];
    existing.appointments = [
      {
        id: "a1",
        patientId: "p1",
        date: "2026-06-01",
        startTime: "10:00",
        endTime: "10:30",
        durationMinutes: 30,
        status: "scheduled",
        price: 0,
        paymentStatus: "pending",
      },
    ];
    existing.doctors = [{ id: "d1", name: "Doc", specialization: "T", phone: "", email: "", cabinet: "—", commissionPercent: 0, status: "active", role: "doctor" }];

    const incoming = { ...existing, patients: [] };
    assert.equal(isSuspiciousClinicDataDowngrade(existing, incoming), true);
  });

  it("rejects accidental loss of half the patients (subset)", () => {
    const existing = createFreshPersistedState();
    existing.patients = Array.from({ length: 8 }, (_, i) => patient(`p${i}`));
    existing.doctors = [{ id: "d1", name: "Doc", specialization: "T", phone: "", email: "", cabinet: "—", commissionPercent: 0, status: "active", role: "doctor" }];

    const incoming = { ...existing, patients: existing.patients.slice(0, 3) };
    assert.equal(isSuspiciousClinicDataDowngrade(existing, incoming), true);
  });

  it("mergeClinicSnapshotWithLocal keeps local-only patients", () => {
    const remote = createFreshPersistedState();
    remote.patients = [patient("p1")];
    const local = createFreshPersistedState();
    local.patients = [patient("p1"), patient("p2")];

    const merged = mergeClinicSnapshotWithLocal(remote, local);
    assert.equal(merged.patients.length, 2);
  });

  it("shouldPushMergedSnapshotAfterLoad when pending buffer exists", () => {
    const remote = createFreshPersistedState();
    remote.patients = [patient("p1")];
    const merged = { ...remote, patients: [patient("p1")] };
    assert.equal(
      shouldPushMergedSnapshotAfterLoad(remote, merged, { hasPendingBuffer: true }),
      true
    );
  });

  it("mergeClinicDataForSave restores patients when incoming is stale subset", () => {
    const existing = createFreshPersistedState();
    existing.patients = Array.from({ length: 8 }, (_, i) => patient(`p${i}`));
    existing.doctors = [{ id: "d1", name: "Doc", specialization: "T", phone: "", email: "", cabinet: "—", commissionPercent: 0, status: "active", role: "doctor" }];

    const incoming = { ...existing, patients: existing.patients.slice(0, 3) };
    const saved = mergeClinicDataForSave(existing, incoming);
    assert.equal(saved.patients.length, 8);
  });

  it("allows patient delete when server still has orphan appointments (incoming is clean)", () => {
    const existing = createFreshPersistedState();
    existing.patients = [patient("p1"), patient("p2")];
    existing.doctors = [{ id: "d1", name: "Doc", specialization: "T", phone: "", email: "", cabinet: "—", commissionPercent: 0, status: "active", role: "doctor" }];
    existing.appointments = [
      {
        id: "a1",
        patientId: "p2",
        doctorId: "d1",
        cabinetId: "c1",
        date: "2026-06-01",
        startTime: "10:00",
        endTime: "10:30",
        durationMinutes: 30,
        status: "scheduled" as const,
        price: 0,
        paymentStatus: "pending" as const,
      },
    ];

    const incoming = {
      ...existing,
      patients: [patient("p1")],
      appointments: [],
    };

    assert.equal(isSuspiciousClinicDataDowngrade(existing, incoming), false);
  });

  it("allows deleting legal documents without false downgrade", () => {
    const existing = createFreshPersistedState();
    existing.legalDocuments = Array.from({ length: 6 }, (_, i) => ({
      id: `ld${i}`,
      category: "consent",
      title: `Doc ${i}`,
      date: "2026-01-01",
    }));

    const incoming = {
      ...existing,
      legalDocuments: existing.legalDocuments.slice(0, 2),
    };

    assert.equal(isSuspiciousClinicDataDowngrade(existing, incoming), false);
  });

  it("shouldRejectEmptyClinicOverwrite blocks blank tab buffer but not staff removal", () => {
    const existing = createFreshPersistedState();
    existing.doctors = [
      {
        id: "d1",
        name: "Doc",
        specialization: "T",
        phone: "",
        email: "",
        cabinet: "—",
        commissionPercent: 0,
        status: "active",
        role: "doctor",
      },
    ];

    const blank = createFreshPersistedState();
    const toSaveBlank = mergeClinicDataForSave(existing, blank);
    assert.equal(shouldRejectEmptyClinicOverwrite(existing, blank, toSaveBlank), true);

    existing.cabinets = [
      {
        id: "c1",
        name: "Кабинет",
        number: "1",
        equipment: [],
        staffIds: [],
        status: "active",
      },
    ];
    const afterRemoval = { ...existing, doctors: [] };
    const toSaveRemoval = mergeClinicDataForSave(existing, afterRemoval);
    assert.equal(
      shouldRejectEmptyClinicOverwrite(existing, afterRemoval, toSaveRemoval),
      false
    );
  });

  it("mergeClinicDataForSave keeps doctors when client sends empty shell", () => {
    const existing = createFreshPersistedState();
    existing.doctors = Array.from({ length: 5 }, (_, i) => ({
      id: `d${i}`,
      name: `Doc ${i}`,
      specialization: "T",
      phone: "",
      email: "",
      cabinet: "—",
      commissionPercent: 0,
      status: "active" as const,
      role: "doctor" as const,
    }));

    const incoming = createFreshPersistedState();
    const saved = mergeClinicDataForSave(existing, incoming);
    assert.equal(saved.doctors.length, 5);
  });

  it("allows deleting the last doctor when clinic has no patients", () => {
    const existing = createFreshPersistedState();
    existing.doctors = [
      {
        id: "d1",
        name: "Doc",
        specialization: "T",
        phone: "",
        email: "",
        cabinet: "—",
        commissionPercent: 0,
        status: "active",
        role: "doctor",
      },
    ];

    const incoming = { ...existing, doctors: [] };
    assert.equal(isSuspiciousClinicDataDowngrade(existing, incoming), false);
  });

  it("mergeClinicDataForSave allows deleting patient with dependent entities", () => {
    const existing = createFreshPersistedState();
    existing.patients = [patient("p1"), patient("p2")];
    existing.doctors = [{ id: "d1", name: "Doc", specialization: "T", phone: "", email: "", cabinet: "—", commissionPercent: 0, status: "active", role: "doctor" }];
    existing.appointments = Array.from({ length: 10 }, (_, i) => ({
      id: `a${i}`,
      patientId: "p2",
      doctorId: "d1",
      cabinetId: "c1",
      date: "2026-06-01",
      startTime: "10:00",
      endTime: "10:30",
      durationMinutes: 30,
      status: "scheduled" as const,
      price: 0,
      paymentStatus: "pending" as const,
    }));

    const incoming = {
      ...existing,
      patients: [patient("p1")],
      appointments: [],
    };

    const saved = mergeClinicDataForSave(existing, incoming);
    assert.equal(saved.patients.some((p) => p.id === "p2"), false);
    assert.equal(saved.appointments.some((a) => a.patientId === "p2"), false);
  });

  it("mergeClinicDataForSave persists medical record deletion", () => {
    const existing = createFreshPersistedState();
    existing.patients = [patient("p1")];
    existing.doctors = [
      {
        id: "d1",
        name: "Doc",
        specialization: "T",
        phone: "",
        email: "",
        cabinet: "—",
        commissionPercent: 0,
        status: "active",
        role: "doctor",
      },
    ];
    existing.medicalRecords = Array.from({ length: 8 }, (_, i) => ({
      id: `mr${i}`,
      patientId: "p1",
      doctorId: "d1",
      date: "2026-06-01",
      diagnosis: `Diag ${i}`,
      complaints: "—",
      treatment: "—",
    }));

    const incoming = {
      ...existing,
      medicalRecords: existing.medicalRecords.filter((r) => r.id !== "mr0" && r.id !== "mr1"),
    };

    assert.equal(isSuspiciousClinicDataDowngrade(existing, incoming), false);
    const saved = mergeClinicDataForSave(existing, incoming);
    assert.equal(saved.medicalRecords.length, 6);
    assert.equal(saved.medicalRecords.some((r) => r.id === "mr0"), false);
  });

  it("mergeClinicDataForSave restores medical records on suspicious mass loss", () => {
    const existing = createFreshPersistedState();
    existing.patients = [patient("p1")];
    existing.doctors = [
      {
        id: "d1",
        name: "Doc",
        specialization: "T",
        phone: "",
        email: "",
        cabinet: "—",
        commissionPercent: 0,
        status: "active",
        role: "doctor",
      },
    ];
    existing.medicalRecords = Array.from({ length: 8 }, (_, i) => ({
      id: `mr${i}`,
      patientId: "p1",
      doctorId: "d1",
      date: "2026-06-01",
      diagnosis: `Diag ${i}`,
      complaints: "—",
      treatment: "—",
    }));

    // Имитируем устаревшую вкладку после деплоя: отправляет старый урезанный снимок медкарты.
    const incoming = {
      ...existing,
      medicalRecords: existing.medicalRecords.slice(0, 2),
    };

    const saved = mergeClinicDataForSave(existing, incoming);
    assert.equal(saved.medicalRecords.length, 8);
  });

  it("isSuspiciousClinicDataDowngrade flags mass medical record loss", () => {
    const existing = createFreshPersistedState();
    existing.patients = [patient("p1")];
    existing.doctors = [
      {
        id: "d1",
        name: "Doc",
        specialization: "T",
        phone: "",
        email: "",
        cabinet: "—",
        commissionPercent: 0,
        status: "active",
        role: "doctor",
      },
    ];
    existing.medicalRecords = Array.from({ length: 8 }, (_, i) => ({
      id: `mr${i}`,
      patientId: "p1",
      doctorId: "d1",
      date: "2026-06-01",
      diagnosis: `Diag ${i}`,
      complaints: "—",
      treatment: "—",
    }));
    const incoming = {
      ...existing,
      medicalRecords: existing.medicalRecords.slice(0, 2),
    };
    assert.equal(isSuspiciousClinicDataDowngrade(existing, incoming), true);
  });

  it("mergeClinicSnapshotWithLocal respects deleted medical records after reload", () => {
    const remote = createFreshPersistedState();
    remote.patients = [patient("p1")];
    remote.medicalRecords = Array.from({ length: 3 }, (_, i) => ({
      id: `mr${i}`,
      patientId: "p1",
      doctorId: "d1",
      date: "2026-06-01",
      diagnosis: `Diag ${i}`,
      complaints: "—",
      treatment: "—",
    }));

    const local = {
      ...remote,
      medicalRecords: remote.medicalRecords.filter((r) => r.id !== "mr1"),
    };

    const merged = mergeClinicSnapshotWithLocal(remote, local);
    assert.equal(merged.medicalRecords.length, 2);
    assert.equal(merged.medicalRecords.some((r) => r.id === "mr1"), false);
  });

  it("mergeClinicSnapshotWithLocal drops orphan payments after act delete+replace", () => {
    const server = createFreshPersistedState();
    server.patients = [patient("p1")];
    server.workActs = [
      {
        id: "act-old",
        actNumber: "0001",
        actDate: "2026-06-29",
        patientId: "p1",
        items: [],
        subtotalAmount: 5000,
        discountType: "percent",
        discount: 0,
        totalAmount: 5000,
        paymentStatus: "paid",
        createdAt: "2026-06-29",
      },
    ];
    server.payments = [
      {
        id: "pay-old",
        patientId: "p1",
        workActId: "act-old",
        amount: 5000,
        method: "cash",
        status: "paid",
        date: "2026-06-29",
      },
    ];

    const client = {
      ...server,
      workActs: [
        {
          id: "act-new",
          actNumber: "0002",
          actDate: "2026-06-15",
          patientId: "p1",
          items: [],
          subtotalAmount: 7000,
          discountType: "percent",
          discount: 0,
          totalAmount: 7000,
          paymentStatus: "pending",
          createdAt: "2026-06-15",
        },
      ],
      payments: [],
    };

    const merged = mergeClinicSnapshotWithLocal(client, server);
    assert.equal(merged.workActs.some((a) => a.id === "act-old"), false);
    assert.equal(merged.workActs.some((a) => a.id === "act-new"), true);
    assert.equal(merged.payments.length, 0);
  });

  it("repairFinancialCoupling removes payments without work act", () => {
    const state = createFreshPersistedState();
    state.payments = [
      {
        id: "pay-1",
        patientId: "p1",
        workActId: "missing-act",
        amount: 1000,
        method: "cash",
        status: "paid",
        date: "2026-06-29",
      },
    ];
    const repaired = repairFinancialCoupling(state);
    assert.equal(repaired.payments.length, 0);
  });

  it("mergeClinicDataForSave keeps legal docs added on another device", () => {
    const existing = createFreshPersistedState();
    existing.legalDocuments = [
      { id: "ld1", category: "Договоры", title: "A", date: "2026-01-01" },
      { id: "ld2", category: "Договоры", title: "B", date: "2026-01-02" },
      { id: "ld3", category: "Договоры", title: "C", date: "2026-01-03" },
    ];

    const incoming = {
      ...existing,
      legalDocuments: existing.legalDocuments.slice(0, 2),
    };

    const merged = mergeClinicDataForSave(existing, incoming);
    assert.equal(merged.legalDocuments.length, 3);
    assert.ok(merged.legalDocuments.some((d) => d.id === "ld3"));
  });

  it("mergeClinicDataForSave respects explicit legal document deletion", () => {
    const existing = createFreshPersistedState();
    existing.legalDocuments = [
      { id: "ld1", category: "Договоры", title: "A", date: "2026-01-01" },
      { id: "ld2", category: "Договоры", title: "B", date: "2026-01-02" },
    ];

    const incoming = {
      ...existing,
      legalDocuments: [existing.legalDocuments[0]!],
      deletedLegalDocumentIds: ["ld2"],
    };

    const merged = mergeClinicDataForSave(existing, incoming);
    assert.equal(merged.legalDocuments.length, 1);
    assert.equal(merged.legalDocuments[0]?.id, "ld1");
  });

  it("mergeClinicSnapshotWithLocal keeps remote-only clinic expenses", () => {
    const remote = createFreshPersistedState();
    remote.clinicExpenses = [
      {
        id: "e1",
        date: "2026-07-14",
        category: "Прочее",
        amount: 1000,
        description: "A",
      },
      {
        id: "e2",
        date: "2026-07-15",
        category: "Прочее",
        amount: 2000,
        description: "B",
      },
    ];
    const local = createFreshPersistedState();
    local.clinicExpenses = [remote.clinicExpenses[0]!];

    const merged = mergeClinicSnapshotWithLocal(remote, local);
    assert.equal(merged.clinicExpenses.length, 2);
    assert.ok(merged.clinicExpenses.some((e) => e.id === "e2"));
  });

  it("hasSnapshotRecoveryFromMerge detects local-only clinic expenses", () => {
    const remote = createFreshPersistedState();
    const merged = createFreshPersistedState();
    merged.clinicExpenses = [
      {
        id: "e-local",
        date: "2026-07-15",
        category: "Прочее",
        amount: 500,
        description: "Local only",
      },
    ];
    assert.equal(hasSnapshotRecoveryFromMerge(remote, merged), true);
  });
});
