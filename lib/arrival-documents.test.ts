import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fillDocumentTemplate, renderMedicalDocumentFormHtml } from "./arrival-documents";
import type { Patient } from "./types";

function patient(): Patient {
  return {
    id: "p1",
    firstName: "Иван",
    lastName: "Иванов",
    middleName: "Иванович",
    phone: "+79001234567",
    birthDate: "1990-05-15",
    gender: "male",
    source: "Google",
    createdAt: "2024-01-01",
    balance: 0,
    totalSpent: 0,
    disability: "none",
    status: "active",
    passportSeries: "4510",
    passportNumber: "123456",
    address: "г. Москва, ул. Примерная, 1",
  };
}

describe("fillDocumentTemplate", () => {
  it("replaces patient and clinic placeholders", () => {
    const text = fillDocumentTemplate(
      "Я, {{patient.fullName}}, паспорт {{patient.passport}}, клиника {{clinic.name}}.",
      {
        patient: patient(),
        clinic: {
          name: "Стоматология Улыбка",
          phone: "+74950000000",
          email: "info@test.ru",
          address: "Москва",
          inn: "7700000000",
          workHours: "9-21",
        },
      }
    );
    assert.match(text, /Иванов Иван Иванович/);
    assert.match(text, /4510 123456/);
    assert.match(text, /Стоматология Улыбка/);
  });

  it("replaces clinic placeholders", () => {
    const text = fillDocumentTemplate(
      "Клиника {{clinic.name}}, ИНН {{clinic.inn}}, {{clinic.address}}, тел. {{clinic.phone}}.",
      {
        patient: patient(),
        clinic: {
          name: "Стоматология Улыбка",
          phone: "+74951112233",
          email: "info@test.ru",
          address: "г. Москва, ул. Ленина, 5",
          inn: "7700000000",
          workHours: "Пн–Пт 9:00–21:00",
        },
      }
    );
    assert.match(text, /Стоматология Улыбка/);
    assert.match(text, /7700000000/);
    assert.match(text, /Ленина, 5/);
    assert.match(text, /\+7 \(495\) 111-22-33/);
  });

  it("renders filled medical contract form with patient and clinic", () => {
    const html = renderMedicalDocumentFormHtml(
      { id: "c1", name: "Договор", kind: "contract" },
      {
        patient: patient(),
        clinic: {
          name: "Стоматология Улыбка",
          phone: "+74951112233",
          email: "info@test.ru",
          address: "г. Москва, ул. Ленина, 5",
          inn: "7700000000",
          workHours: "Пн–Пт 9:00–21:00",
        },
        doctor: {
          id: "d1",
          name: "Иванов И.И.",
          specialization: "Стоматолог-терапевт",
          phone: "",
          email: "",
          cabinet: "1",
          commissionPercent: 0,
          status: "active",
          role: "doctor",
        },
      }
    );
    assert.match(html, /Иванов Иван Иванович/);
    assert.match(html, /Стоматология Улыбка/);
    assert.match(html, /Иванов И\.И\./);
    assert.match(html, /7700000000/);
  });
});
