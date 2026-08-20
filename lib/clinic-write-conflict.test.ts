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

  it("keeps server payment on overlap and keeps client-only payment on write-conflict", () => {
    const base = createFreshPersistedState();
    const act: WorkAct = {
      id: "wa-1",
      patientId: "p1",
      doctorId: "d1",
      actDate: "2026-08-19",
      actNumber: "0009-08/2026",
      actType: "services",
      items: [],
      subtotalAmount: 1500,
      discountType: "percent",
      discount: 0,
      totalAmount: 1500,
      createdAt: "2026-08-19",
      paymentStatus: "paid",
    };
    const serverPayment = {
      id: "pay-1",
      patientId: "p1",
      amount: 1500,
      method: "card" as const,
      status: "paid" as const,
      date: "2026-08-19",
      workActId: "wa-1",
    };
    const staleClientPayment = {
      ...serverPayment,
      amount: 100,
      method: "cash" as const,
    };
    const newClientPayment = {
      ...serverPayment,
      id: "pay-2",
      amount: 700,
    };
    const existing = { ...base, workActs: [act], payments: [serverPayment] };
    const incoming = {
      ...base,
      workActs: [act],
      payments: [staleClientPayment, newClientPayment],
    };

    const merged = mergeClinicDataOnWriteConflict(existing, incoming);
    const kept = merged.payments.find((p) => p.id === "pay-1");
    assert.equal(kept?.amount, 1500);
    assert.equal(kept?.method, "card");
    assert.equal(merged.payments.some((p) => p.id === "pay-2"), true);
  });

  it("keeps server work-act financial state on overlap and keeps client-only work-act", () => {
    const base = createFreshPersistedState();
    const serverAct: WorkAct = {
      id: "wa-1",
      patientId: "p1",
      doctorId: "d1",
      actDate: "2026-08-19",
      actNumber: "0010-08/2026",
      actType: "services",
      items: [{ id: "i1", serviceName: "Пломба", quantity: 1, price: 2000, total: 2000 }],
      subtotalAmount: 2000,
      discountType: "percent",
      discount: 0,
      totalAmount: 2000,
      createdAt: "2026-08-19",
      paymentStatus: "paid",
      submittedToAdmin: true,
    };
    const staleClientAct: WorkAct = {
      ...serverAct,
      items: [],
      paymentStatus: "pending",
      submittedToAdmin: false,
    };
    const newClientAct: WorkAct = {
      ...serverAct,
      id: "wa-2",
      actNumber: "0011-08/2026",
      paymentStatus: "pending",
      submittedToAdmin: false,
    };
    const existing = { ...base, workActs: [serverAct] };
    const incoming = { ...base, workActs: [staleClientAct, newClientAct] };

    const merged = mergeClinicDataOnWriteConflict(existing, incoming);
    const kept = merged.workActs.find((act) => act.id === "wa-1");
    assert.equal(kept?.paymentStatus, "paid");
    assert.equal(kept?.submittedToAdmin, true);
    assert.equal(kept?.items.length, 1);
    assert.equal(merged.workActs.some((act) => act.id === "wa-2"), true);
  });

  it("keeps client ready_for_payment when server still lags after act submit", () => {
    const base = createFreshPersistedState();
    const appointment: Appointment = {
      id: "apt1",
      patientId: "p1",
      doctorId: "d1",
      date: "2026-06-20",
      startTime: "10:00",
      endTime: "11:00",
      durationMinutes: 60,
      status: "completed",
      price: 0,
      paymentStatus: "pending",
    };
    const existing = { ...base, appointments: [appointment] };
    const incoming = {
      ...base,
      appointments: [
        {
          ...appointment,
          status: "ready_for_payment" as const,
          workActId: "act1",
        },
      ],
    };

    const merged = mergeClinicDataOnWriteConflict(existing, incoming);
    assert.equal(merged.appointments[0]?.status, "ready_for_payment");
    assert.equal(merged.appointments[0]?.workActId, "act1");
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

  it("write-conflict keeps server patient card (stale client PUT must not overwrite command API)", () => {
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
    assert.equal(patient?.firstName, "Старое");
    assert.equal(patient?.lastName, "Имя");
    assert.equal(patient?.phone, "+79001110000");
  });

  it("non-conflict PUT keeps server patient card (stale client must not wipe command write)", () => {
    const base = createFreshPersistedState();
    const serverPatient = {
      id: "p1",
      firstName: "Команда",
      lastName: "Свежая",
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
      firstName: "Старое",
      lastName: "ФИО",
    };
    const existing = { ...base, patients: [serverPatient] };
    const incoming = { ...base, patients: [clientPatient] };

    const merged = mergeClinicDataForSave(existing, incoming);
    const patient = merged.patients.find((p) => p.id === "p1");
    assert.equal(patient?.firstName, "Команда");
    assert.equal(patient?.lastName, "Свежая");
  });

  it("non-conflict PUT keeps server service (stale client must not wipe command write)", () => {
    const base = createFreshPersistedState();
    const serverService: Service = {
      id: "srv-1",
      name: "Новое название",
      category: "Хирургия",
      price: 5000,
      active: true,
    };
    const clientService: Service = {
      ...serverService,
      name: "Старое название",
      category: "Терапия",
    };
    const existing = { ...base, services: [serverService] };
    const incoming = { ...base, services: [clientService] };

    const merged = mergeClinicDataForSave(existing, incoming);
    const service = merged.services.find((s) => s.id === "srv-1");
    assert.equal(service?.name, "Новое название");
    assert.equal(service?.category, "Хирургия");
  });

  it("non-conflict PUT keeps server legal document title/file over stale client", () => {
    const base = createFreshPersistedState();
    const serverDoc = {
      id: "legal-1",
      title: "Новый договор",
      category: "Договоры",
      date: "2026-08-15",
      fileDataUrl: "data:application/pdf;base64,AAAA",
      fileName: "new.pdf",
    };
    const clientDoc = {
      ...serverDoc,
      title: "Старый договор",
      fileDataUrl: "data:application/pdf;base64,BBBB",
      fileName: "old.pdf",
    };
    const existing = { ...base, legalDocuments: [serverDoc] };
    const incoming = { ...base, legalDocuments: [clientDoc] };

    const merged = mergeClinicDataForSave(existing, incoming);
    const doc = merged.legalDocuments.find((d) => d.id === "legal-1");
    assert.equal(doc?.title, "Новый договор");
    assert.equal(doc?.fileName, "new.pdf");
    assert.equal(doc?.fileDataUrl, "data:application/pdf;base64,AAAA");
  });

  it("non-conflict PUT still accepts brand-new patient from client", () => {
    const base = createFreshPersistedState();
    const serverPatient = {
      id: "p1",
      firstName: "Есть",
      lastName: "НаСервере",
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
    const newPatient = {
      ...serverPatient,
      id: "p-new",
      firstName: "Новый",
      lastName: "Клиент",
    };
    const existing = { ...base, patients: [serverPatient] };
    const incoming = { ...base, patients: [serverPatient, newPatient] };

    const merged = mergeClinicDataForSave(existing, incoming);
    assert.equal(merged.patients.some((p) => p.id === "p-new"), true);
    assert.equal(merged.patients.find((p) => p.id === "p-new")?.lastName, "Клиент");
  });

  it("non-conflict PUT keeps server appointment status (stale client must not wipe command write)", () => {
    const base = createFreshPersistedState();
    const appointment: Appointment = {
      id: "apt1",
      patientId: "p1",
      doctorId: "d1",
      date: "2026-06-20",
      startTime: "10:00",
      endTime: "11:00",
      durationMinutes: 60,
      status: "arrived",
      price: 0,
      paymentStatus: "pending",
    };
    const existing = { ...base, appointments: [appointment] };
    const incoming = {
      ...base,
      appointments: [{ ...appointment, status: "scheduled" as const }],
    };

    const merged = mergeClinicDataForSave(existing, incoming);
    assert.equal(merged.appointments[0]?.status, "arrived");
  });

  it("non-conflict PUT keeps server work-act paymentStatus and accepts client-only new act", () => {
    const base = createFreshPersistedState();
    const serverAct: WorkAct = {
      id: "wa1",
      patientId: "p1",
      doctorId: "d1",
      actDate: "2026-06-20",
      actNumber: "1",
      actType: "services",
      items: [{ id: "i1", serviceName: "Пломба", quantity: 1, price: 1000, total: 1000 }],
      subtotalAmount: 1000,
      discountType: "percent",
      discount: 0,
      totalAmount: 1000,
      createdAt: "2026-06-20",
      paymentStatus: "paid",
      submittedToAdmin: true,
    };
    const staleClientAct: WorkAct = {
      ...serverAct,
      paymentStatus: "pending",
      submittedToAdmin: false,
      items: [],
    };
    const newClientAct: WorkAct = {
      ...serverAct,
      id: "wa-new",
      actNumber: "2",
      paymentStatus: "pending",
      submittedToAdmin: false,
    };
    const existing = { ...base, workActs: [serverAct] };
    const incoming = { ...base, workActs: [staleClientAct, newClientAct] };

    const merged = mergeClinicDataForSave(existing, incoming);
    const kept = merged.workActs.find((a) => a.id === "wa1");
    assert.equal(kept?.paymentStatus, "paid");
    assert.equal(kept?.submittedToAdmin, true);
    assert.equal(kept?.items.length, 1);
    assert.equal(merged.workActs.some((a) => a.id === "wa-new"), true);
  });

  it("non-conflict PUT keeps server payment on overlap and accepts client-only payment", () => {
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
    const serverPayment = {
      id: "pay1",
      patientId: "p1",
      amount: 1000,
      method: "card" as const,
      status: "paid" as const,
      date: "2026-06-20",
      workActId: "wa1",
    };
    const staleClientPayment = { ...serverPayment, amount: 100, method: "cash" as const };
    const newClientPayment = {
      ...serverPayment,
      id: "pay-new",
      amount: 500,
    };
    const existing = { ...base, workActs: [act], payments: [serverPayment] };
    const incoming = {
      ...base,
      workActs: [act],
      payments: [staleClientPayment, newClientPayment],
    };

    const merged = mergeClinicDataForSave(existing, incoming);
    assert.equal(merged.payments.find((p) => p.id === "pay1")?.amount, 1000);
    assert.equal(merged.payments.find((p) => p.id === "pay1")?.method, "card");
    assert.equal(merged.payments.some((p) => p.id === "pay-new"), true);
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

  it("non-conflict PUT keeps server clinic settings over stale client payload", () => {
    const base = createFreshPersistedState();
    const existing = {
      ...base,
      clinicSettings: {
        ...base.clinicSettings,
        name: "Серверная клиника",
      },
    };
    const incoming = {
      ...base,
      clinicSettings: {
        ...base.clinicSettings,
        name: "Старая вкладка",
      },
    };

    const merged = mergeClinicDataForSave(existing, incoming);
    assert.equal(merged.clinicSettings.name, "Серверная клиника");
  });

  it("non-conflict PUT keeps server staff on overlap and preserves client-only new staff", () => {
    const base = createFreshPersistedState();
    const serverDoctor = {
      id: "doc-1",
      name: "Серверный врач",
      specialization: "Терапия",
      phone: "",
      email: "doc1@example.com",
      cabinet: "—",
      commissionPercent: 20,
      status: "active" as const,
      role: "doctor" as const,
    };
    const staleDoctor = {
      ...serverDoctor,
      name: "Устаревшее имя",
      commissionPercent: 10,
    };
    const clientOnlyDoctor = {
      ...serverDoctor,
      id: "doc-2",
      name: "Новый локальный",
      email: "doc2@example.com",
    };
    const existing = { ...base, doctors: [serverDoctor] };
    const incoming = { ...base, doctors: [staleDoctor, clientOnlyDoctor] };

    const merged = mergeClinicDataForSave(existing, incoming);
    const keptServer = merged.doctors.find((d) => d.id === "doc-1");
    assert.equal(keptServer?.name, "Серверный врач");
    assert.equal(keptServer?.commissionPercent, 20);
    assert.equal(merged.doctors.some((d) => d.id === "doc-2"), true);
  });

  it("non-conflict PUT keeps server doctor schedule over stale client with same-day updatedAt", () => {
    const base = createFreshPersistedState();
    const serverSchedule = {
      doctorId: "doc-1",
      month: "2026-08",
      days: {
        "2026-08-21": { working: true, startTime: "11:00", endTime: "20:00" },
      },
      updatedAt: "2026-08-21T10:00:00.000Z",
    };
    const staleClient = {
      doctorId: "doc-1",
      month: "2026-08",
      days: {
        "2026-08-21": { working: false, startTime: "10:00", endTime: "19:00" },
      },
      updatedAt: "2026-08-21",
    };
    const existing = { ...base, doctorSchedules: [serverSchedule] };
    const incoming = { ...base, doctorSchedules: [staleClient] };
    const merged = mergeClinicDataForSave(existing, incoming);
    const kept = merged.doctorSchedules.find(
      (s) => s.doctorId === "doc-1" && s.month === "2026-08"
    );
    assert.equal(
      (kept?.days["2026-08-21"] as { working: boolean }).working,
      true
    );
    assert.equal(
      (kept?.days["2026-08-21"] as { startTime: string }).startTime,
      "11:00"
    );
  });
});
