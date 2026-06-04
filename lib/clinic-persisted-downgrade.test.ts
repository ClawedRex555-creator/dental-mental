import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createFreshPersistedState,
  isSuspiciousClinicDataDowngrade,
  mergeClinicDataForSave,
  mergeClinicSnapshotWithLocal,
  shouldPushMergedSnapshotAfterLoad,
  shouldRejectEmptyClinicOverwrite,
} from "./clinic-persisted-state.ts";
import type { Patient } from "./types.ts";

function patient(id: string): Patient {
  return {
    id,
    firstName: "A",
    lastName: "B",
    phone: "+79000000000",
    birthDate: "1990-01-01",
    balance: 0,
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
      paymentStatus: "unpaid" as const,
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
});
