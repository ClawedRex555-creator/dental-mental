import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Service } from "./types";
import {
  getClinicBillableServices,
  getTechnicalServices,
  isTechnicalServiceCategory,
  LEGACY_IMPLANT_PROSTHETICS_CATEGORY,
  SERVICE_CATEGORY_IMPLANTATION,
  SERVICE_CATEGORY_PROSTHETICS,
  SERVICE_CATEGORY_TECHNICAL,
  groupServicesByCategory,
  mergeClinicServices,
  normalizeServiceCategory,
  normalizeServiceFields,
  splitLegacyImplantProstheticsCategory,
} from "./service-categories";

describe("service categories", () => {
  it("maps implantation and prosthetics separately", () => {
    assert.equal(normalizeServiceCategory("Имплантация"), SERVICE_CATEGORY_IMPLANTATION);
    assert.equal(normalizeServiceCategory("Протезирование"), SERVICE_CATEGORY_PROSTHETICS);
    assert.equal(
      normalizeServiceCategory(LEGACY_IMPLANT_PROSTHETICS_CATEGORY),
      SERVICE_CATEGORY_IMPLANTATION
    );
  });

  it("splits legacy combined category by service name", () => {
    assert.equal(splitLegacyImplantProstheticsCategory("Имплант Nobel"), SERVICE_CATEGORY_IMPLANTATION);
    assert.equal(
      splitLegacyImplantProstheticsCategory("Коронка на имплантате"),
      SERVICE_CATEGORY_PROSTHETICS
    );
  });

  it("migrates legacy category on normalizeServiceFields", () => {
    const implant = normalizeServiceFields({
      id: "1",
      name: "Имплант",
      category: LEGACY_IMPLANT_PROSTHETICS_CATEGORY,
      price: 50000,
    });
    assert.equal(implant.category, SERVICE_CATEGORY_IMPLANTATION);

    const crown = normalizeServiceFields({
      id: "2",
      name: "Коронка на имплантате",
      category: LEGACY_IMPLANT_PROSTHETICS_CATEGORY,
      price: 35000,
    });
    assert.equal(crown.category, SERVICE_CATEGORY_PROSTHETICS);
  });

  it("groups services into implantation and prosthetics tabs", () => {
    const services: Service[] = [
      { id: "1", name: "Имплант", category: SERVICE_CATEGORY_IMPLANTATION, price: 50000 },
      { id: "2", name: "Коронка", category: SERVICE_CATEGORY_PROSTHETICS, price: 18000 },
      { id: "3", name: "Пломба", category: "Терапия", price: 3000 },
    ];
    const groups = groupServicesByCategory(services);
    assert.equal(groups.find((g) => g.category === SERVICE_CATEGORY_IMPLANTATION)?.items.length, 1);
    assert.equal(groups.find((g) => g.category === SERVICE_CATEGORY_PROSTHETICS)?.items.length, 1);
  });

  it("separates technical services from clinic price list", () => {
    const services: Service[] = [
      { id: "1", name: "Пломба", category: "Терапия", price: 3000 },
      {
        id: "2",
        name: "Лабораторный этап",
        category: SERVICE_CATEGORY_TECHNICAL,
        price: 1200,
        technicianName: "Техник",
        linkedClinicServiceId: "1",
      },
    ];
    assert.equal(isTechnicalServiceCategory("Техническая"), true);
    assert.equal(getClinicBillableServices(services).length, 1);
    assert.equal(getTechnicalServices(services).length, 1);
    const groups = groupServicesByCategory(services);
    assert.equal(
      groups.some((g) => g.category === SERVICE_CATEGORY_TECHNICAL),
      false,
      "technical must stay out of clinic category groups (left panel only)"
    );
  });

  it("merge keeps local services when remote snapshot is shorter", () => {
    const remote: Service[] = [{ id: "a", name: "A", category: "Терапия", price: 1000 }];
    const local: Service[] = [
      { id: "b", name: "Имплант", category: SERVICE_CATEGORY_IMPLANTATION, price: 50000 },
    ];
    const merged = mergeClinicServices(remote, local);
    assert.equal(merged.length, 2);
    assert.ok(merged.some((s) => s.id === "b" && s.category === SERVICE_CATEGORY_IMPLANTATION));
  });
});
