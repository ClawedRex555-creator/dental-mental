import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clinicSlugMismatch,
  parseClinicSlugFromHost,
} from "./clinic-host.ts";

describe("clinic-host", () => {
  it("parses clinic slug when APP_ROOT_DOMAIN is localhost in bundle", () => {
    const prev = process.env.APP_ROOT_DOMAIN;
    process.env.APP_ROOT_DOMAIN = "localhost";
    assert.equal(parseClinicSlugFromHost("tstom.emkaro.ru"), "tstom");
    assert.equal(parseClinicSlugFromHost("emkaro.ru"), null);
    if (prev === undefined) delete process.env.APP_ROOT_DOMAIN;
    else process.env.APP_ROOT_DOMAIN = prev;
  });

  it("does not flag slug mismatch when host slug cannot be parsed", () => {
    const prev = process.env.APP_ROOT_DOMAIN;
    process.env.APP_ROOT_DOMAIN = "localhost";
    assert.equal(clinicSlugMismatch("tstom", "app:3000"), false);
    if (prev === undefined) delete process.env.APP_ROOT_DOMAIN;
    else process.env.APP_ROOT_DOMAIN = prev;
  });

  it("flags mismatch when both slugs are known and differ", () => {
    const prev = process.env.APP_ROOT_DOMAIN;
    process.env.APP_ROOT_DOMAIN = "emkaro.ru";
    assert.equal(clinicSlugMismatch("ulybka", "tstom.emkaro.ru"), true);
    assert.equal(clinicSlugMismatch("tstom", "tstom.emkaro.ru"), false);
    if (prev === undefined) delete process.env.APP_ROOT_DOMAIN;
    else process.env.APP_ROOT_DOMAIN = prev;
  });
});
