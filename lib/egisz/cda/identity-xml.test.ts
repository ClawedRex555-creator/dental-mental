import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildOrganizationPropsXml,
  buildPatientIdentityDocXml,
  resolveOrganizationRegistration,
} from "./identity-xml";

describe("organization requisites in CDA", () => {
  it("uses Ogrnip for IP, not INN in Ogrn", () => {
    const reg = resolveOrganizationRegistration({
      inn: "123456789012",
      ogrnip: "316774600123456",
    });
    assert.equal(reg.kind, "ip");
    const xml = buildOrganizationPropsXml({ inn: "123456789012", ogrnip: "316774600123456" });
    assert.match(xml, /<identity:Ogrnip xsi:type="ST">316774600123456<\/identity:Ogrnip>/);
    assert.doesNotMatch(xml, /<identity:Ogrn>/);
  });

  it("uses Ogrn for legal entity (ООО), ignoring ogrnip if INN is 10 digits", () => {
    const reg = resolveOrganizationRegistration({
      inn: "7707083893",
      ogrn: "1027700132195",
      ogrnip: "316774600123456",
    });
    assert.equal(reg.kind, "ul");
    const xml = buildOrganizationPropsXml({
      inn: "7707083893",
      ogrn: "1027700132195",
      ogrnip: "316774600123456",
    });
    assert.match(xml, /<identity:Ogrn xsi:type="ST">1027700132195<\/identity:Ogrn>/);
    assert.doesNotMatch(xml, /<identity:Ogrnip>/);
  });

  it("uses Ogrn for legal entity", () => {
    const xml = buildOrganizationPropsXml({ inn: "7707083893", ogrn: "1027700132195" });
    assert.match(xml, /<identity:Ogrn xsi:type="ST">1027700132195<\/identity:Ogrn>/);
    assert.doesNotMatch(xml, /<identity:Ogrnip>/);
  });

  it("returns nullFlavor when requisites missing", () => {
    const xml = buildOrganizationPropsXml({ inn: "123456789012" });
    assert.match(xml, /<identity:Props nullFlavor="NI"\/>/);
  });
});

describe("patient IdentityDoc", () => {
  const base = {
    id: "p1",
    firstName: "Иван",
    lastName: "Иванов",
    phone: "79001112233",
    birthDate: "1990-01-01",
    gender: "male" as const,
    createdAt: "2024-01-01",
  };

  it("uses nullFlavor when passport incomplete", () => {
    const xml = buildPatientIdentityDocXml({
      ...base,
      passportSeries: "4509",
      passportNumber: "123456",
    });
    assert.match(xml, /<identity:IdentityDoc nullFlavor="NI"\/>/);
  });

  it("emits full IdentityDoc with correct codeSystem and xsi:types", () => {
    const xml = buildPatientIdentityDocXml({
      ...base,
      passportSeries: "4509",
      passportNumber: "123456",
      passportIssuedAt: "2015-02-18",
      passportIssuedBy: "ОВД Тест",
      passportIssuerCode: "770-001",
    });
    assert.match(xml, /codeSystem="1\.2\.643\.5\.1\.13\.13\.99\.2\.48"/);
    assert.match(xml, /<identity:Series xsi:type="ST">4509<\/identity:Series>/);
    assert.match(xml, /<identity:Number xsi:type="ST">123456<\/identity:Number>/);
    assert.match(xml, /<identity:IssueOrgName xsi:type="ST">ОВД Тест<\/identity:IssueOrgName>/);
    assert.match(xml, /<identity:IssueDate xsi:type="TS" value="20150218"\/>/);
  });
});
