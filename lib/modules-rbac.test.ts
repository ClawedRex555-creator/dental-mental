import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultClinicModules, parseClinicModules } from "./modules";
import { canAccessPath, filterNavByModules, navItemsForRole } from "./rbac";
import { isPathBlockedByModules, resolveSafeRedirectPath } from "./modules-rbac";

describe("modules-rbac", () => {
  it("parseClinicModules always keeps settings enabled", () => {
    const m = parseClinicModules({ settings: false, legal: false });
    assert.equal(m.settings, true);
    assert.equal(m.legal, false);
  });

  it("settings and profile are never blocked", () => {
    const modules = parseClinicModules({ appointments: false, settings: false });
    assert.equal(isPathBlockedByModules("/settings", modules), false);
    assert.equal(isPathBlockedByModules("/profile", modules), false);
  });

  it("disabled module path is blocked", () => {
    const modules = parseClinicModules({ legal: false });
    assert.equal(isPathBlockedByModules("/legal", modules), true);
  });

  it("resolveSafeRedirectPath avoids redirect loop to same path", () => {
    const modules = parseClinicModules({ legal: false, appointments: true });
    const target = resolveSafeRedirectPath("owner", modules, "/legal");
    assert.notEqual(target, "/legal");
    assert.equal(canAccessPath("owner", target, modules), true);
  });

  it("doctor can access services catalog (read-only route)", () => {
    const modules = defaultClinicModules();
    assert.equal(canAccessPath("doctor", "/warehouse", modules), true);
    assert.equal(canAccessPath("assistant", "/warehouse", modules), false);
  });

  it("doctor can open /warehouse via proxy (no modules arg)", () => {
    assert.equal(canAccessPath("doctor", "/warehouse"), true);
    assert.equal(canAccessPath("assistant", "/warehouse"), false);
  });

  it("doctor nav always includes Услуги even when warehouse module is off", () => {
    const modules = parseClinicModules({ warehouse: false, patients: true });
    const nav = navItemsForRole("doctor", modules);
    assert.ok(
      nav.some((item) => item.href === "/warehouse"),
      "doctor sidebar must include /warehouse"
    );
    assert.equal(
      nav.filter((item) => item.href === "/warehouse").length,
      1
    );
  });

  it("doctor sees treatment plans when treatment_plans module is off", () => {
    const modules = parseClinicModules({ treatment_plans: false, patients: true });
    assert.equal(isPathBlockedByModules("/treatment-plans", modules, "doctor"), false);
    assert.equal(canAccessPath("doctor", "/treatment-plans", modules), true);
    const nav = navItemsForRole("doctor", modules);
    assert.ok(nav.some((item) => item.href === "/treatment-plans"));
  });

  it("doctor sees services when warehouse module is off", () => {
    const modules = parseClinicModules({ warehouse: false, patients: false });
    assert.equal(isPathBlockedByModules("/warehouse", modules, "doctor"), false);
    assert.equal(canAccessPath("doctor", "/warehouse", modules), true);
    const nav = filterNavByModules(
      [{ href: "/warehouse" }],
      modules,
      "doctor"
    );
    assert.equal(nav.length, 1);
    assert.equal(isPathBlockedByModules("/warehouse", modules, "owner"), true);
  });

  it("when only settings available, redirect goes to settings", () => {
    const allOff = parseClinicModules(
      Object.fromEntries(
        Object.keys(defaultClinicModules()).map((k) => [k, false])
      ) as Record<string, boolean>
    );
    const target = resolveSafeRedirectPath("owner", allOff, "/legal");
    assert.equal(target, "/settings");
  });
});
