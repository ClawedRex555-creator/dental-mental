import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clinicSlugMismatch,
  parseClinicSlugFromHost,
} from "./clinic-host";

describe("clinic-host", () => {
  it("parses clinic slug when APP_ROOT_DOMAIN is localhost in bundle", () => {
    const prev = process.env.APP_ROOT_DOMAIN;
    process.env.APP_ROOT_DOMAIN = "localhost";
    assert.equal(parseClinicSlugFromHost("demo.localhost:3000"), "demo");
    assert.equal(parseClinicSlugFromHost("tstom.emkaro.ru"), "tstom");
    assert.equal(parseClinicSlugFromHost("emkaro.ru"), null);
    if (prev === undefined) delete process.env.APP_ROOT_DOMAIN;
    else process.env.APP_ROOT_DOMAIN = prev;
  });

  it("flags mismatch when session has clinic slug but host is platform or unparseable", () => {
    const prev = process.env.APP_ROOT_DOMAIN;
    process.env.APP_ROOT_DOMAIN = "localhost";
    assert.equal(clinicSlugMismatch("tstom", "app:3000"), true);
    process.env.APP_ROOT_DOMAIN = "emkaro.ru";
    assert.equal(clinicSlugMismatch("tstom", "emkaro.ru"), true);
    if (prev === undefined) delete process.env.APP_ROOT_DOMAIN;
    else process.env.APP_ROOT_DOMAIN = prev;
  });

  it("does not flag mismatch when session has no clinic slug", () => {
    assert.equal(clinicSlugMismatch(undefined, "app:3000"), false);
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
