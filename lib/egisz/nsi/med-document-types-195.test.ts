import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CDA_CONSULTATION_REV4_NSI, resolveN3MedDocumentType } from "@/lib/egisz/nsi/document-type-hints";
import {
  getNsi195MedDocumentType,
  validateN3MedDocumentTypeForTemplate,
} from "@/lib/egisz/nsi/med-document-types-195";

describe("NSI 1.2.643.2.69.1.1.1.195", () => {
  it("maps consultation CDA template OID to IdMedDocumentType 198", () => {
    assert.equal(
      resolveN3MedDocumentType(CDA_CONSULTATION_REV4_NSI.templateOid),
      "198"
    );
  });

  it("loads consultation rev4 from catalog export", () => {
    const row = getNsi195MedDocumentType("198");
    assert.ok(row);
    assert.equal(row?.remd_code, "119");
    assert.match(row?.name ?? "", /Протокол консультации/i);
    assert.equal(row?.mime_type_remd, "CDA");
  });

  it("validates default template settings", () => {
    const v = validateN3MedDocumentTypeForTemplate(CDA_CONSULTATION_REV4_NSI.templateOid);
    assert.equal(v.ok, true);
    if (v.ok) {
      assert.equal(v.idMedDocumentType, "198");
      assert.equal(v.entry?.remd_code, "119");
    }
  });
});
