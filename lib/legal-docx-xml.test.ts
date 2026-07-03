import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  collectPlaceholdersFromDocxXml,
  extractDocxPlainText,
  normalizeDocxPlaceholderXml,
} from "./legal-docx-xml.ts";

describe("extractDocxPlainText", () => {
  it("joins text split across Word runs", () => {
    const xml =
      '<w:t>{</w:t></w:r><w:r><w:t>patient</w:t></w:r><w:r><w:t>_full_name}</w:t>';
    const text = extractDocxPlainText(xml);
    assert.equal(text.includes("{patient_full_name}"), true);
  });
});

describe("collectPlaceholdersFromDocxXml", () => {
  it("finds placeholders when Word splits runs", () => {
    const xml = `<w:document>
      <w:p><w:r><w:t>{</w:t></w:r><w:r><w:t>patient</w:t></w:r><w:r><w:t>_full_name}</w:t></w:r></w:p>
      <w:p><w:r><w:t>{customer_passport}</w:t></w:r></w:p>
    </w:document>`;
    const names = collectPlaceholdersFromDocxXml(xml);
    assert.deepEqual(names.sort(), ["customer_passport", "patient_full_name"]);
  });
});

describe("normalizeDocxPlaceholderXml", () => {
  it("collapses split placeholder markup", () => {
    const xml =
      '<w:p><w:r><w:t>{</w:t></w:r><w:r><w:t>patient</w:t></w:r><w:r><w:t>_phone}</w:t></w:r></w:p>';
    const normalized = normalizeDocxPlaceholderXml(xml);
    assert.equal(normalized.includes("{patient_phone}"), true);
  });
});
