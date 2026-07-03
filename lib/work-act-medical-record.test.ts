import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildMedicalRecordFromWorkAct,
  enrichMedicalRecordForWorkAct,
  ensureMedicalRecordForWorkAct,
  findMedicalRecordForWorkAct,
} from "@/lib/work-act-medical-record";
import type { Appointment, MedicalRecord, WorkAct } from "@/lib/types";

const act = (overrides: Partial<WorkAct> = {}): WorkAct => ({
  id: "act1",
  actNumber: "12",
  actDate: "2026-06-22",
  patientId: "p1",
  doctorId: "d1",
  appointmentId: "apt1",
  items: [
    {
      id: "i1",
      serviceName: "Лечение кариеса",
      quantity: 1,
      price: 5000,
      total: 5000,
    },
  ],
  subtotalAmount: 5000,
  discountType: "percent",
  discount: 0,
  discountBearer: "shared",
  totalAmount: 5000,
  paymentStatus: "pending",
  createdAt: "2026-06-22",
  ...overrides,
});

const appointment: Appointment = {
  id: "apt1",
  patientId: "p1",
  doctorId: "d1",
  date: "2026-06-22",
  startTime: "10:00",
  endTime: "10:30",
  status: "ready_for_payment",
  complaints: "Болит зуб 16",
  reason: "Болит зуб 16",
  price: 5000,
  paymentStatus: "pending",
};

describe("findMedicalRecordForWorkAct", () => {
  it("finds by workActId and appointmentId", () => {
    const records: MedicalRecord[] = [
      {
        id: "mr1",
        patientId: "p1",
        doctorId: "d1",
        appointmentId: "apt1",
        workActId: "act1",
        complaints: "x",
        diagnosis: "y",
        treatment: "z",
        createdAt: "2026-06-22",
      },
    ];
    assert.equal(findMedicalRecordForWorkAct(act(), records)?.id, "mr1");
    assert.equal(
      findMedicalRecordForWorkAct(act({ id: "act2", medicalRecordId: "mr1" }), records)?.id,
      "mr1"
    );
  });
});

describe("buildMedicalRecordFromWorkAct", () => {
  it("uses appointment complaints and act services", () => {
    const record = buildMedicalRecordFromWorkAct(act(), appointment, "mr-new");
    assert.equal(record.complaints, "Болит зуб 16");
    assert.equal(record.treatment, "Лечение кариеса");
    assert.equal(record.workActId, "act1");
    assert.match(record.recommendations ?? "", /Акт № 12/);
  });
});

describe("ensureMedicalRecordForWorkAct", () => {
  it("creates record when missing", () => {
    const result = ensureMedicalRecordForWorkAct(act(), [], appointment);
    assert.equal(result.records.length, 1);
    assert.equal(result.record.complaints, "Болит зуб 16");
    assert.equal(result.actMedicalRecordId, result.record.id);
  });

  it("enriches existing record", () => {
    const existing: MedicalRecord = {
      id: "mr1",
      patientId: "p1",
      doctorId: "d1",
      complaints: "По акту оказанных услуг",
      diagnosis: "Оказаны стоматологические услуги",
      treatment: "старое",
      createdAt: "2026-06-22",
    };
    const result = ensureMedicalRecordForWorkAct(act(), [existing], appointment);
    assert.equal(result.record.complaints, "Болит зуб 16");
    assert.equal(result.record.treatment, "Лечение кариеса");
    assert.equal(result.record.workActId, "act1");
  });
});

describe("enrichMedicalRecordForWorkAct", () => {
  it("keeps diagnosis when enriching", () => {
    const record: MedicalRecord = {
      id: "mr1",
      patientId: "p1",
      doctorId: "d1",
      complaints: "старые жалобы",
      diagnosis: "K02.1",
      treatment: "старое",
      createdAt: "2026-06-22",
    };
    const enriched = enrichMedicalRecordForWorkAct(record, act(), appointment);
    assert.equal(enriched.diagnosis, "K02.1");
    assert.equal(enriched.complaints, "Болит зуб 16");
  });
});
