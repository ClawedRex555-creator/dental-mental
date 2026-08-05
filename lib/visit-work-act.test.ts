import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findMedicalRecordForAppointment,
  findWorkActForAppointment,
} from "./visit-work-act";
import type { Appointment, MedicalRecord, WorkAct } from "./types";

const apt: Appointment = {
  id: "apt-1",
  patientId: "pat-1",
  date: "2026-06-01",
  startTime: "10:00",
  endTime: "10:30",
  durationMinutes: 30,
  status: "completed",
  price: 0,
  paymentStatus: "paid",
};

describe("findWorkActForAppointment", () => {
  const act: WorkAct = {
    id: "act-1",
    actNumber: "0001",
    actDate: "2026-06-01",
    patientId: "pat-1",
    appointmentId: "apt-1",
    items: [],
    subtotalAmount: 0,
    discountType: "percent",
    discount: 0,
    totalAmount: 0,
    paymentStatus: "paid",
    createdAt: "2026-06-01",
    notes: "После лечения наблюдение",
  };

  it("finds act by appointment.workActId", () => {
    const found = findWorkActForAppointment(
      { ...apt, workActId: "act-1" },
      [act],
      []
    );
    assert.equal(found?.id, "act-1");
  });

  it("finds act via medical record", () => {
    const record: MedicalRecord = {
      id: "mr-1",
      patientId: "pat-1",
      doctorId: "doc-1",
      appointmentId: "apt-1",
      workActId: "act-1",
      complaints: "боль",
      diagnosis: "кариес",
      treatment: "пломба",
      createdAt: "2026-06-01",
    };
    const found = findWorkActForAppointment(apt, [act], [record]);
    assert.equal(found?.id, "act-1");
  });
});

describe("findMedicalRecordForAppointment", () => {
  it("returns record linked to appointment", () => {
    const record: MedicalRecord = {
      id: "mr-1",
      patientId: "pat-1",
      doctorId: "doc-1",
      appointmentId: "apt-1",
      complaints: "боль",
      diagnosis: "кариес",
      treatment: "пломба",
      createdAt: "2026-06-01",
    };
    assert.equal(findMedicalRecordForAppointment(apt, [record])?.id, "mr-1");
  });
});
