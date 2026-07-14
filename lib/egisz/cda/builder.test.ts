import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCdaForTemplate } from "./templates/registry";
import { CDA_TEMPLATE_CATALOG } from "./templates/catalog";

const patient = {
  id: "p1",
  firstName: "Наталья",
  lastName: "Тимошенко",
  middleName: "Петровна",
  phone: "+79001234567",
  birthDate: "1985-03-15",
  gender: "female",
  snils: "123-456-789 01",
  createdAt: "2024-01-01",
};

const doctor = {
  id: "d1",
  name: "Фалий Екатерина Павловна",
  specialization: "Стоматолог-терапевт",
  phone: "+79007654321",
  email: "doc@test.ru",
  snils: "98765432101",
  frmrOid: "1.2.643.5.1.13.13.12.2.61.138304.100.1.1.70",
  positionCode: "34",
  cabinet: "1",
  commissionPercent: 30,
};

const record = {
  id: "mr1",
  patientId: "p1",
  doctorId: "d1",
  appointmentId: "apt1",
  complaints: "Боль в зубе",
  anamnesis: "Болит 3 дня",
  lifeAnamnesis: "Хронических заболеваний нет",
  objective: "Кариес 36",
  diagnosis: "K02.1 Кариес поверхностный",
  treatment: "Пломбирование",
  recommendations: "Контроль через 6 месяцев",
  createdAt: "2026-07-03",
  serviceName: "Терапевтический приём",
  paymentAmount: 4500,
  referralTarget: "Рентген-кабинет",
};

const clinic = {
  name: "ИП Макарова М.И.",
  phone: "88631234567",
  email: "clinic@test.ru",
  address: "г. Ростов-на-Дону, ул. Примерная, 1",
  inn: "123456789012",
  workHours: "9-18",
};

const baseConfig = {
  enabled: true,
  environment: "test" as const,
  autoSubmitSemd: false,
  organizationOid: "1.2.643.5.1.13.13.12.2.61.138304",
  connectionMode: "live" as const,
  n3: { guid: "1e5c8739-f89a-68df-40d4-496b29a943aa" },
  systemId: "1.2.643.2.69.1.2.999.90",
};

function buildForOid(templateOid: string) {
  return buildCdaForTemplate({
    patient,
    doctor,
    record,
    clinic,
    config: { ...baseConfig, documentOid: templateOid },
    documentUuid: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  });
}

describe("buildCdaForTemplate", () => {
  it("builds consultation rev4 with mandatory blocks", () => {
    const meta = CDA_TEMPLATE_CATALOG.find((t) => t.key === "consultation_rev4")!;
    const xml = buildForOid(meta.templateOid);
    assert.match(xml, /<legalAuthenticator>/);
    assert.match(xml, /<documentationOf>/);
    assert.match(xml, /<code code="5"/);
    assert.match(xml, new RegExp(`<templateId root="${meta.templateOid}"/>`));
    assert.match(xml, /extension="POCD_MT000040"/);
    assert.match(xml, /<section[\s\S]*code="RESCONS"/);
    assert.match(xml, /<streetAddressLine>/);
    assert.match(xml, /<identity:IdentityDoc/);
    assert.match(
      xml,
      /<patient>[\s\S]*<name>[\s\S]*<family>Тимошенко<\/family>[\s\S]*<given>Наталья<\/given>[\s\S]*<given>Петровна<\/given>[\s\S]*<\/name>[\s\S]*<\/patient>/
    );
    assert.match(xml, /typeCode="PPRF"/);
    assert.doesNotMatch(xml, /<code code="341"/);
  });

  it("builds all catalog templates without error", () => {
    for (const meta of CDA_TEMPLATE_CATALOG) {
      const xml = buildForOid(meta.templateOid);
      assert.match(xml, /<ClinicalDocument/);
      assert.match(xml, new RegExp(`<templateId root="${meta.templateOid}"/>`));
      assert.match(xml, /extension="POCD_MT000040"/);
    }
  });

  it("rejects unknown template OID", () => {
    assert.throws(
      () =>
        buildCdaForTemplate({
          patient,
          doctor,
          record,
          clinic,
          config: { ...baseConfig, documentOid: "1.2.3.4" },
          documentUuid: "x",
        }),
      /Неподдерживаемый OID/
    );
  });
});
