import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseClinicSaveServerResponse } from "./clinic-save-feedback";

describe("parseClinicSaveServerResponse", () => {
  it("accepts explicit ok with updatedAt", () => {
    const res = new Response(JSON.stringify({ ok: true, updatedAt: "2026-07-04T08:00:00.000Z" }), {
      status: 200,
    });
    const parsed = parseClinicSaveServerResponse(res, {
      ok: true,
      updatedAt: "2026-07-04T08:00:00.000Z",
    });
    assert.equal(parsed.ok, true);
    assert.equal(parsed.updatedAt, "2026-07-04T08:00:00.000Z");
  });

  it("rejects 200 without ok flag", () => {
    const res = new Response(JSON.stringify({ updatedAt: "2026-07-04T08:00:00.000Z" }), {
      status: 200,
    });
    const parsed = parseClinicSaveServerResponse(res, {
      updatedAt: "2026-07-04T08:00:00.000Z",
    });
    assert.equal(parsed.ok, false);
  });

  it("rejects ok without updatedAt", () => {
    const res = new Response(JSON.stringify({ ok: true }), { status: 200 });
    const parsed = parseClinicSaveServerResponse(res, { ok: true });
    assert.equal(parsed.ok, false);
  });

  it("maps 403 to forbidden", () => {
    const res = new Response(JSON.stringify({ ok: false, error: "Доступ запрещён" }), {
      status: 403,
    });
    const parsed = parseClinicSaveServerResponse(res, { error: "Доступ запрещён" });
    assert.equal(parsed.ok, false);
    assert.equal(parsed.forbidden, true);
  });
});
