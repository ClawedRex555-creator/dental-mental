import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { missingLegalConsentBundleEntries } from "./legal-consents-bundle.generated";

describe("missingLegalConsentBundleEntries", () => {
  it("skips tombstoned consent ids by default", () => {
    const missing = missingLegalConsentBundleEntries([], {
      deletedIds: ["legal-consent-1"],
    });
    assert.equal(missing.some((e) => e.id === "legal-consent-1"), false);
    assert.ok(missing.length > 0);
  });

  it("can include tombstoned ids for explicit re-import", () => {
    const missing = missingLegalConsentBundleEntries([], {
      deletedIds: ["legal-consent-1"],
      includeDeleted: true,
    });
    assert.ok(missing.some((e) => e.id === "legal-consent-1"));
  });
});
