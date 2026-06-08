import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Service } from "./types";
import {
  groupServicesByCategory,
  mergeClinicServices,
  normalizeServiceCategory,
  normalizeServiceFields,
} from "./service-categories";

describe("service categories", () => {
  it("keeps implant category from dropdown", () => {
    assert.equal(
      normalizeServiceCategory("Имплантация и протезирование"),
      "Имплантация и протезирование"
    );
  });

  it("does not move implant services to orthopedics by service name", () => {
    const fixed = normalizeServiceFields({
      id: "1",
      name: "Коронка на имплантате",
      category: "Имплантация и протезирование",
      price: 35000,
    });
    assert.equal(fixed.category, "Имплантация и протезирование");
  });

  it("maps standalone prosthetics label to orthopedics", () => {
    assert.equal(normalizeServiceCategory("протезирование"), "Ортопедия");
    assert.equal(normalizeServiceCategory("ортопедия"), "Ортопедия");
    assert.equal(normalizeServiceCategory("хирургия"), "Хирургия");
  });

  it("groups services into canonical categories", () => {
    const services: Service[] = [
      { id: "1", name: "Имплант", category: "Имплантация и протезирование", price: 50000 },
      { id: "2", name: "Коронка", category: "Ортопедия", price: 18000 },
    ];
    const groups = groupServicesByCategory(services);
    assert.equal(
      groups.find((g) => g.category === "Имплантация и протезирование")?.items.length,
      1
    );
    assert.equal(groups.find((g) => g.category === "Ортопедия")?.items.length, 1);
  });

  it("merge keeps local services when remote snapshot is shorter", () => {
    const remote: Service[] = [
      { id: "a", name: "A", category: "Терапия", price: 1000 },
    ];
    const local: Service[] = [
      {
        id: "b",
        name: "Имплант",
        category: "Имплантация и протезирование",
        price: 50000,
      },
    ];
    const merged = mergeClinicServices(remote, local);
    assert.equal(merged.length, 2);
    assert.ok(
      merged.some(
        (s) => s.id === "b" && s.category === "Имплантация и протезирование"
      )
    );
  });

  it("local wins on same id conflict", () => {
    const remote: Service[] = [
      {
        id: "x",
        name: "X",
        category: "Ортопедия",
        price: 1000,
      },
    ];
    const local: Service[] = [
      {
        id: "x",
        name: "X",
        category: "Имплантация и протезирование",
        price: 50000,
      },
    ];
    const merged = mergeClinicServices(remote, local);
    assert.equal(merged[0]?.category, "Имплантация и протезирование");
  });
});
