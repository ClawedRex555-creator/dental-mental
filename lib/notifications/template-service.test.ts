import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderNotificationTemplate, validateTemplateVariables } from "./template-service";

describe("notification template-service", () => {
  it("substitutes variables", () => {
    const out = renderNotificationTemplate(
      "Здравствуйте, {{patientName}}. Запись {{appointmentDate}} в {{appointmentTime}}.",
      {
        patientName: "Иван Иванов",
        appointmentDate: "15.07.2026",
        appointmentTime: "10:30",
        doctorName: "—",
        cabinetName: "—",
        clinicName: "Клиника",
        clinicPhone: "+7",
        clinicAddress: "—",
      }
    );
    assert.match(out, /Иван Иванов/);
    assert.match(out, /15.07.2026/);
  });

  it("flags unknown variables", () => {
    assert.deepEqual(validateTemplateVariables("{{patientName}} {{diagnosis}}"), ["diagnosis"]);
  });
});
