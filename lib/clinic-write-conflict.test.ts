import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createFreshPersistedState,
  mergeClinicDataForSave,
  mergeClinicDataOnWriteConflict,
} from "./clinic-persisted-state";
import { buildRestoredPatientStub } from "./patient-visits";
import type { Appointment, Service, WorkAct } from "./types";

describe("mergeClinicDataOnWriteConflict", () => {
  it("keeps server appointment doctor when client snapshot is stale", () => {
    const base = createFreshPersistedState();
    const appointment: Appointment = {
      id: "apt1",
      patientId: "p1",
      doctorId: "d2",
      date: "2026-06-20",
      startTime: "10:00",
      endTime: "11:00",
      durationMinutes: 60,
      status: "scheduled",
      price: 0,
      paymentStatus: "pending",
    };
    const existing = {
      ...base,
      appointments: [appointment],
    };
    const incoming = {
      ...base,
      appointments: [{ ...appointment, doctorId: "d1" }],
    };

    const merged = mergeClinicDataOnWriteConflict(existing, incoming);
    assert.equal(merged.appointments[0]?.doctorId, "d2");
  });

  it("drops appointment status change on write-conflict merge (why command API must not autoMerge)", () => {
    const base = createFreshPersistedState();
    const appointment: Appointment = {
      id: "apt1",
      patientId: "p1",
      doctorId: "d1",
      date: "2026-06-20",
      startTime: "10:00",
      endTime: "11:00",
      durationMinutes: 60,
      status: "scheduled",
      price: 0,
      paymentStatus: "pending",
    };
    const existing = { ...base, appointments: [appointment] };
    // Command apply на устаревшем CAS: incoming уже с новым status
    const incoming = {
      ...base,
      appointments: [{ ...appointment, status: "arrived" as const }],
    };

    const merged = mergeClinicDataOnWriteConflict(existing, incoming);
    assert.equal(
      merged.appointments[0]?.status,
      "scheduled",
      "autoMerge предпочитает server — command API обязан retry без autoMerge"
    );
  });

  it("keeps new appointments from client when absent on server", () => {
    const base = createFreshPersistedState();
    const existing = { ...base, appointments: [] };
    const incoming = {
      ...base,
      appointments: [
        {
          id: "apt-new",
          patientId: "p1",
          doctorId: "d1",
          date: "2026-06-20",
          startTime: "12:00",
          endTime: "13:00",
          durationMinutes: 60,
          status: "scheduled" as const,
          price: 0,
          paymentStatus: "pending" as const,
        },
      ],
    };

    const merged = mergeClinicDataOnWriteConflict(existing, incoming);
    assert.equal(merged.appointments.length, 1);
    assert.equal(merged.appointments[0]?.id, "apt-new");
  });

  it("does not resurrect work acts deleted on client during write conflict", () => {
    const base = createFreshPersistedState();
    const act1: WorkAct = {
      id: "wa1",
      patientId: "p1",
      doctorId: "d1",
      actDate: "2026-06-20",
      actNumber: "1",
      actType: "services",
      items: [],
      subtotalAmount: 1000,
      discountType: "percent",
      discount: 0,
      totalAmount: 1000,
      createdAt: "2026-06-20",
      paymentStatus: "paid",
    };
    const act2: WorkAct = {
      ...act1,
      id: "wa2",
      actNumber: "2",
      patientId: "p2",
    };
    const existing = { ...base, workActs: [act1, act2] };
    const incoming = { ...base, workActs: [act2] };

    const merged = mergeClinicDataOnWriteConflict(existing, incoming);
    assert.equal(merged.workActs.length, 1);
    assert.equal(merged.workActs[0]?.id, "wa2");
  });

  it("keeps work-act tombstone when stale client still has deleted act", () => {
    const base = createFreshPersistedState();
    const deletedAct: WorkAct = {
      id: "wa0069",
      patientId: "p1",
      doctorId: "d1",
      actDate: "2026-07-08",
      actNumber: "0069",
      actType: "services",
      items: [],
      subtotalAmount: 1000,
      discountType: "percent",
      discount: 0,
      totalAmount: 1000,
      createdAt: "2026-06-20",
      paymentStatus: "pending",
    };
    const existing = {
      ...base,
      workActs: [],
      deletedWorkActIds: ["wa0069"],
    };
    const incoming = {
      ...base,
      workActs: [deletedAct], // stale tab still has old act
      deletedWorkActIds: [],
    };

    const merged = mergeClinicDataOnWriteConflict(existing, incoming);
    assert.equal(merged.workActs.some((a) => a.id === "wa0069"), false);
    assert.equal(merged.deletedWorkActIds?.includes("wa0069"), true);
  });

  it("keeps work-act tombstone when stale client saves without write conflict", () => {
    const base = createFreshPersistedState();
    const deletedAct: WorkAct = {
      id: "wa0069",
      patientId: "p1",
      doctorId: "d1",
      actDate: "2026-07-08",
      actNumber: "0069",
      actType: "services",
      items: [],
      subtotalAmount: 1000,
      discountType: "percent",
      discount: 0,
      totalAmount: 1000,
      createdAt: "2026-06-20",
      paymentStatus: "pending",
    };
    const existing = {
      ...base,
      workActs: [],
      deletedWorkActIds: ["wa0069"],
    };
    const incoming = {
      ...base,
      workActs: [deletedAct], // stale tab still has old act
      deletedWorkActIds: [],
    };

    const merged = mergeClinicDataForSave(existing, incoming);
    assert.equal(merged.workActs.some((a) => a.id === "wa0069"), false);
    assert.equal(merged.deletedWorkActIds?.includes("wa0069"), true);
  });

  it("keeps service tombstone when stale client still has deleted service", () => {
    const base = createFreshPersistedState();
    const deletedService: Service = {
      id: "srv-cleaning",
      name: "Гигиена",
      category: "Терапия",
      price: 5000,
      active: true,
    };
    const existing = {
      ...base,
      services: [],
      deletedServiceIds: ["srv-cleaning"],
    };
    const incoming = {
      ...base,
      services: [deletedService], // stale tab still has old service
      deletedServiceIds: [],
    };

    const merged = mergeClinicDataForSave(existing, incoming);
    assert.equal(merged.services.some((service) => service.id === "srv-cleaning"), false);
    assert.equal(merged.deletedServiceIds?.includes("srv-cleaning"), true);
  });

  it("keeps patient and appointment tombstones when stale client still has them", () => {
    const base = createFreshPersistedState();
    const appointment: Appointment = {
      id: "apt-gone",
      patientId: "p-gone",
      doctorId: "d1",
      date: "2026-08-01",
      startTime: "10:00",
      endTime: "11:00",
      durationMinutes: 60,
      status: "scheduled",
      price: 0,
      paymentStatus: "pending",
    };
    const patient = {
      id: "p-gone",
      firstName: "Иван",
      lastName: "Удалённый",
      phone: "+79001112233",
      birthDate: "1990-01-01",
      gender: "male" as const,
      source: "Сайт" as const,
      status: "active" as const,
      disability: "not_specified" as const,
      createdAt: "2026-01-01",
      balance: 0,
      totalSpent: 0,
    };
    const existing = {
      ...base,
      patients: [],
      appointments: [],
      deletedPatientIds: ["p-gone"],
      deletedAppointmentIds: ["apt-gone"],
    };
    const incoming = {
      ...base,
      patients: [patient],
      appointments: [appointment],
      deletedPatientIds: [],
      deletedAppointmentIds: [],
    };

    const forSave = mergeClinicDataForSave(existing, incoming);
    assert.equal(forSave.patients.some((p) => p.id === "p-gone"), false);
    assert.equal(forSave.appointments.some((a) => a.id === "apt-gone"), false);
    assert.equal(forSave.deletedPatientIds?.includes("p-gone"), true);
    assert.equal(forSave.deletedAppointmentIds?.includes("apt-gone"), true);

    const onConflict = mergeClinicDataOnWriteConflict(existing, incoming);
    assert.equal(onConflict.patients.some((p) => p.id === "p-gone"), false);
    assert.equal(onConflict.appointments.some((a) => a.id === "apt-gone"), false);
  });

  it("keeps server work acts when stale client sends empty list on write conflict", () => {
    const base = createFreshPersistedState();
    const act: WorkAct = {
      id: "wa1",
      patientId: "p1",
      doctorId: "d1",
      actDate: "2026-06-20",
      actNumber: "1",
      actType: "services",
      items: [],
      subtotalAmount: 1000,
      discountType: "percent",
      discount: 0,
      totalAmount: 1000,
      createdAt: "2026-06-20",
      paymentStatus: "paid",
    };
    const existing = { ...base, workActs: [act] };
    const incoming = { ...base, workActs: [] };

    const merged = mergeClinicDataOnWriteConflict(existing, incoming);
    assert.equal(merged.workActs.length, 1);
    assert.equal(merged.workActs[0]?.id, "wa1");
  });

  it("keeps server appointments when stale client sends empty list on write conflict", () => {
    const base = createFreshPersistedState();
    const appointment: Appointment = {
      id: "apt1",
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
    const existing = { ...base, appointments: [appointment] };
    const incoming = { ...base, appointments: [] };

    const merged = mergeClinicDataOnWriteConflict(existing, incoming);
    assert.equal(merged.appointments.length, 1);
    assert.equal(merged.appointments[0]?.id, "apt1");
  });

  it("renumbers duplicate act numbers when two doctors save concurrently", () => {
    const base = createFreshPersistedState();
    const existingAct: WorkAct = {
      id: "wa-existing",
      patientId: "p1",
      doctorId: "d1",
      actDate: "2026-07-25",
      createdAt: "2026-07-25T11:00:00.000Z",
      actNumber: "0095-07/2026",
      items: [],
      subtotalAmount: 1000,
      discountType: "percent",
      discount: 0,
      totalAmount: 1000,
      paymentStatus: "paid",
    };
    const incomingAct: WorkAct = {
      id: "wa-incoming",
      patientId: "p2",
      doctorId: "d2",
      actDate: "2026-07-25",
      createdAt: "2026-07-25T13:00:00.000Z",
      actNumber: "0095-07/2026",
      items: [],
      subtotalAmount: 2000,
      discountType: "percent",
      discount: 0,
      totalAmount: 2000,
      paymentStatus: "pending",
    };

    const merged = mergeClinicDataForSave(
      { ...base, workActs: [existingAct], actCounter: 96 },
      { ...base, workActs: [incomingAct], actCounter: 96 }
    );

    assert.equal(merged.workActs.length, 2);
    assert.equal(new Set(merged.workActs.map((a) => a.actNumber)).size, 2);
    assert.equal(
      merged.workActs.find((a) => a.id === "wa-existing")?.actNumber,
      "0095-07/2026"
    );
    assert.notEqual(
      merged.workActs.find((a) => a.id === "wa-incoming")?.actNumber,
      "0095-07/2026"
    );
  });

  it("write-conflict keeps client patient edits over stale server card", () => {
    const base = createFreshPersistedState();
    const serverPatient = {
      id: "p1",
      firstName: "Старое",
      lastName: "Имя",
      phone: "+79001110000",
      birthDate: "1990-01-01",
      gender: "female" as const,
      source: "Сайт" as const,
      status: "active" as const,
      disability: "not_specified" as const,
      createdAt: "2026-01-01",
      balance: 0,
      totalSpent: 0,
    };
    const clientPatient = {
      ...serverPatient,
      firstName: "Новое",
      lastName: "ФИО",
      phone: "+79001112233",
      address: "ул. Новая, 1",
    };
    const existing = { ...base, patients: [serverPatient] };
    const incoming = { ...base, patients: [clientPatient] };

    const merged = mergeClinicDataOnWriteConflict(existing, incoming);
    const patient = merged.patients.find((p) => p.id === "p1");
    assert.equal(patient?.firstName, "Новое");
    assert.equal(patient?.lastName, "ФИО");
    assert.equal(patient?.phone, "+79001112233");
    assert.equal(patient?.address, "ул. Новая, 1");
  });

  it("write-conflict prefers real patient FIO over server restored stub", () => {
    const base = createFreshPersistedState();
    const stubState = {
      ...base,
      appointments: [
        {
          id: "apt1",
          patientId: "p1",
          doctorId: "d1",
          date: "2026-08-14",
          startTime: "13:30",
          endTime: "14:00",
          durationMinutes: 30,
          status: "scheduled" as const,
          price: 0,
          paymentStatus: "pending" as const,
        },
      ],
    };
    const stub = buildRestoredPatientStub("p1", stubState);
    const real = {
      id: "p1",
      firstName: "Ирина",
      lastName: "Смирнова",
      middleName: "Ивановна",
      phone: "+79001112233",
      birthDate: "1990-01-01",
      gender: "female" as const,
      source: "Сайт" as const,
      status: "active" as const,
      disability: "not_specified" as const,
      createdAt: "2026-01-01",
      balance: 0,
      totalSpent: 0,
    };
    const existing = { ...stubState, patients: [stub] };
    const incoming = { ...base, patients: [real], appointments: [] };

    const merged = mergeClinicDataOnWriteConflict(existing, incoming);
    const patient = merged.patients.find((p) => p.id === "p1");
    assert.equal(patient?.lastName, "Смирнова");
    assert.equal(patient?.firstName, "Ирина");
  });

  it("deletedDoctorIds tombstone prevents staff resurrection on save merge", () => {
    const base = createFreshPersistedState();
    const doctor = {
      id: "doc1",
      name: "Иванов",
      specialization: "Терапия",
      phone: "",
      email: "",
      cabinet: "—",
      commissionPercent: 0,
      status: "active" as const,
      role: "doctor" as const,
    };
    const existing = { ...base, doctors: [doctor], patients: [] };
    const incoming = {
      ...base,
      doctors: [],
      deletedDoctorIds: ["doc1"],
    };

    const saved = mergeClinicDataForSave(existing, incoming);
    assert.equal(saved.doctors.some((d) => d.id === "doc1"), false);
    assert.equal(saved.deletedDoctorIds?.includes("doc1"), true);

    // Устаревшая вкладка всё ещё содержит сотрудника — tombstone побеждает
    const staleClient = { ...base, doctors: [doctor], deletedDoctorIds: [] };
    const afterStale = mergeClinicDataForSave(saved, staleClient);
    assert.equal(afterStale.doctors.some((d) => d.id === "doc1"), false);
    assert.equal(afterStale.deletedDoctorIds?.includes("doc1"), true);
  });
});
