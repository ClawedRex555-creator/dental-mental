import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mapAppointmentStatusForMobile,
  mapAppointmentToMobile,
} from "./mobile-staff-map";
import type { Appointment, Doctor, Patient } from "./types";

const patient: Patient = {
  id: "pat_1",
  firstName: "Иван",
  lastName: "Иванов",
  phone: "+79990001122",
  birthDate: "1990-01-01",
  gender: "male",
  source: "Google",
  status: "active",
  createdAt: "2024-01-01T00:00:00.000Z",
  balance: 0,
  totalSpent: 0,
  disability: "none",
};

const doctor: Doctor = {
  id: "doc_1",
  name: "Петров",
  specialization: "Терапевт",
  phone: "",
  email: "doc@example.com",
  cabinet: "1",
  commissionPercent: 40,
  status: "active",
  role: "doctor",
};

const baseAppointment: Appointment = {
  id: "apt_1",
  patientId: "pat_1",
  doctorId: "doc_1",
  date: "2026-06-22",
  startTime: "10:30",
  endTime: "11:00",
  durationMinutes: 30,
  status: "confirmed",
  reason: "Осмотр",
  price: 2500,
  paymentStatus: "pending",
};

describe("mobile staff mapping", () => {
  it("maps active appointment statuses to scheduled", () => {
    assert.equal(mapAppointmentStatusForMobile("confirmed"), "scheduled");
    assert.equal(mapAppointmentStatusForMobile("in_progress"), "scheduled");
  });

  it("maps terminal statuses", () => {
    assert.equal(mapAppointmentStatusForMobile("completed"), "completed");
    assert.equal(mapAppointmentStatusForMobile("ready_for_payment"), "completed");
    assert.equal(mapAppointmentStatusForMobile("cancelled"), "cancelled");
    assert.equal(mapAppointmentStatusForMobile("no_show"), "noShow");
  });

  it("maps appointment with patient and doctor names", () => {
    const mapped = mapAppointmentToMobile(
      baseAppointment,
      [patient],
      [doctor],
      "clinic_1",
      "Тстом"
    );
    assert.equal(mapped.patientName, "Иванов Иван");
    assert.equal(mapped.doctorName, "Петров");
    assert.equal(mapped.clinicName, "Тстом");
    assert.equal(mapped.scheduledAt, "2026-06-22T10:30:00");
    assert.equal(mapped.status, "scheduled");
    assert.equal(mapped.price, 2500);
  });
});
