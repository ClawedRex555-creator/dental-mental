import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createFreshPersistedState,
  hasSnapshotRecoveryFromMerge,
  isSuspiciousClinicDataDowngrade,
  mergeClinicDataForSave,
  mergeClinicDataOnWriteConflict,
  mergeClinicSnapshotWithLocal,
  mergeLegalDocumentsState,
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

  it("mergeClinicSnapshotWithLocal prefers remote appointment status, keeps local-only appts", () => {
    const remote = createFreshPersistedState();
    remote.appointments = [
      {
        id: "apt1",
        patientId: "p1",
        doctorId: "d1",
        date: "2026-08-11",
        startTime: "10:00",
        endTime: "10:30",
        durationMinutes: 30,
        status: "arrived",
        price: 0,
        paymentStatus: "pending",
      },
    ];
    const local = createFreshPersistedState();
    local.appointments = [
      {
        id: "apt1",
        patientId: "p1",
        doctorId: "d1",
        date: "2026-08-11",
        startTime: "10:00",
        endTime: "10:30",
        durationMinutes: 30,
        status: "scheduled",
        price: 0,
        paymentStatus: "pending",
      },
      {
        id: "apt-local",
        patientId: "p1",
        doctorId: "d1",
        date: "2026-08-11",
        startTime: "11:00",
        endTime: "11:30",
        durationMinutes: 30,
        status: "scheduled",
        price: 0,
        paymentStatus: "pending",
      },
    ];

    const merged = mergeClinicSnapshotWithLocal(remote, local);
    assert.equal(merged.appointments.find((a) => a.id === "apt1")?.status, "arrived");
    assert.equal(merged.appointments.some((a) => a.id === "apt-local"), true);
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

  it("mergeClinicDataForSave does not let empty client phone wipe server phone", () => {
    const existing = createFreshPersistedState();
    existing.patients = [{ ...patient("p1"), phone: "+79991112233", firstName: "Мария" }];
    existing.doctors = [{ id: "d1", name: "Doc", specialization: "T", phone: "", email: "", cabinet: "—", commissionPercent: 0, status: "active", role: "doctor" }];
    const incoming = {
      ...existing,
      patients: [{ ...existing.patients[0]!, phone: "", firstName: "Анна" }],
    };
    const saved = mergeClinicDataForSave(existing, incoming);
    // Ordinary PUT: server patient card wins (command API uses replaceAppliedSnapshot).
    assert.equal(saved.patients[0]?.phone, "+79991112233");
    assert.equal(saved.patients[0]?.firstName, "Мария");
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
    // merge поднимает server doctors/patients — пустой клиент больше не обнуляет снимок.
    // Guard срабатывает, только если toSave реально пустой относительно existing.
    assert.equal(toSaveBlank.doctors.length, 1);
    assert.equal(
      shouldRejectEmptyClinicOverwrite(existing, blank, createFreshPersistedState()),
      true
    );

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
      deletedPatientIds: ["p2"],
    };

    const saved = mergeClinicDataForSave(existing, incoming);
    assert.equal(saved.patients.some((p) => p.id === "p2"), false);
    assert.equal(saved.appointments.some((a) => a.patientId === "p2"), false);
  });

  it("mergeClinicDataForSave keeps server-only patient without tombstone", () => {
    const existing = createFreshPersistedState();
    existing.patients = [patient("p1"), patient("p-new")];
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
    const incoming = {
      ...existing,
      patients: [patient("p1")],
    };
    const saved = mergeClinicDataForSave(existing, incoming);
    assert.equal(saved.patients.some((p) => p.id === "p-new"), true);
    assert.equal((saved.deletedPatientIds ?? []).includes("p-new"), false);
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
      createdAt: "2026-06-01",
    }));

    const incoming = {
      ...existing,
      medicalRecords: existing.medicalRecords.filter((r) => r.id !== "mr0" && r.id !== "mr1"),
      deletedMedicalRecordIds: ["mr0", "mr1"],
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
      createdAt: "2026-06-01",
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
      createdAt: "2026-06-01",
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
      createdAt: "2026-06-01",
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
        discountType: "percent" as const,
        discount: 0,
        totalAmount: 5000,
        paymentStatus: "paid" as const,
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
          discountType: "percent" as const,
          discount: 0,
          totalAmount: 7000,
          paymentStatus: "pending" as const,
          createdAt: "2026-06-15",
        },
      ],
      payments: [],
      deletedWorkActIds: ["act-old"],
    };

    // pull: remote=server (ещё со старым актом), local=client (замена + tombstone)
    const merged = mergeClinicSnapshotWithLocal(server, client);
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

  it("mergeClinicDataOnWriteConflict keeps client clinicSettings over server", () => {
    const existing = createFreshPersistedState();
    existing.clinicSettings = {
      ...existing.clinicSettings,
      name: "Старое название",
      phone: "+79000000000",
    };
    const incoming = {
      ...existing,
      clinicSettings: {
        ...existing.clinicSettings,
        name: "Новое название",
        phone: "+79001112233",
      },
    };
    const merged = mergeClinicDataOnWriteConflict(existing, incoming);
    assert.equal(merged.clinicSettings.name, "Новое название");
    assert.equal(merged.clinicSettings.phone, "+79001112233");
  });

  it("mergeLegalDocumentsState keeps fileDataUrl when slim pending overwrites metadata", () => {
    const withFile = {
      id: "ld1",
      category: "Договоры",
      title: "Договор",
      date: "2026-08-13",
      fileName: "dogovor.pdf",
      fileDataUrl: "data:application/pdf;base64,JVBERi0xLjQK",
    };
    const slimmed = {
      id: "ld1",
      category: "Договоры",
      title: "Договор (правка)",
      date: "2026-08-13",
      fileName: "dogovor.pdf",
    };
    const { legalDocuments } = mergeLegalDocumentsState([withFile], [slimmed]);
    assert.equal(legalDocuments.length, 1);
    assert.equal(legalDocuments[0]?.title, "Договор (правка)");
    assert.equal(legalDocuments[0]?.fileDataUrl, withFile.fileDataUrl);
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
