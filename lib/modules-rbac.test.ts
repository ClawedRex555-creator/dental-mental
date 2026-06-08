import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultClinicModules, parseClinicModules } from "./modules";
import { canAccessPath } from "./rbac";
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
