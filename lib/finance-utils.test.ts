import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calcDoctorPaymentForAct } from "./finance-utils";
import type { Doctor, Service, WorkAct } from "./types";

const doctor: Doctor = {
  id: "d1",
  name: "Врач",
  specialization: "Хирург",
  phone: "+79000000000",
  email: "doc@test.ru",
  cabinet: "—",
  commissionPercent: 30,
  implantFeeType: "percent",
  implantFee: 20,
  status: "active",
  role: "doctor",
};

const services: Service[] = [
  { id: "s1", name: "Имплант", category: "Имплантация", price: 50000 },
  { id: "s2", name: "Пломба", category: "Терапия", price: 5000 },
  { id: "s3", name: "Коронка на имплантате", category: "Протезирование", price: 30000 },
];

function makeAct(items: WorkAct["items"]): WorkAct {
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  return {
    id: "a1",
    actNumber: "1",
    actDate: "2026-06-01",
    patientId: "p1",
    doctorId: "d1",
    items,
    subtotalAmount: subtotal,
    discountType: "percent",
    discount: 0,
    totalAmount: subtotal,
    paymentStatus: "paid",
    createdAt: "2026-06-01",
  };
}

describe("calcDoctorPaymentForAct", () => {
  it("uses implant fee percent only for implantation category", () => {
    const act = makeAct([
      {
        id: "i1",
        serviceId: "s1",
        serviceName: "Имплант",
        serviceCategory: "Имплантация",
        quantity: 1,
        price: 50000,
        total: 50000,
      },
      {
        id: "i2",
        serviceId: "s2",
        serviceName: "Пломба",
        serviceCategory: "Терапия",
        quantity: 1,
        price: 5000,
        total: 5000,
      },
    ]);
    const split = calcDoctorPaymentForAct(act, doctor, services);
    assert.equal(split.doctorAmount, 10000 + 1500);
  });

  it("uses general commission for prosthetics tab", () => {
    const act = makeAct([
      {
        id: "i1",
        serviceId: "s3",
        serviceName: "Коронка на имплантате",
        serviceCategory: "Протезирование",
        quantity: 1,
        price: 30000,
        total: 30000,
      },
    ]);
    const split = calcDoctorPaymentForAct(act, doctor, services);
    assert.equal(split.doctorAmount, 9000);
  });

  it("uses fixed rubles per implant unit", () => {
    const implantDoctor = { ...doctor, implantFeeType: "rubles" as const, implantFee: 7000 };
    const act = makeAct([
      {
        id: "i1",
        serviceId: "s1",
        serviceName: "Имплант",
        serviceCategory: "Имплантация",
        quantity: 2,
        price: 50000,
        total: 100000,
      },
    ]);
    const split = calcDoctorPaymentForAct(act, implantDoctor, services);
    assert.equal(split.doctorAmount, 14000);
  });
});
