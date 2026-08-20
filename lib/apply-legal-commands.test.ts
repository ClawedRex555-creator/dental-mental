import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyDeleteLegalDocumentToPersistedState,
  applyUpsertLegalDocumentToPersistedState,
} from "./apply-legal-commands";
import type { ClinicPersistedState } from "./clinic-persisted-state";
import { createFreshPersistedState } from "./clinic-persisted-state";

function emptyState(): ClinicPersistedState {
  const base = createFreshPersistedState();
  return {
    ...base,
    legalDocuments: [],
    deletedLegalDocumentIds: [],
  };
}

describe("apply-legal-commands", () => {
  it("upserts document and survives second identical call as alreadyApplied", () => {
    const base = emptyState();
    const document = {
      id: "legal-1",
      title: "Договор",
      category: "Договоры",
      date: "2026-08-15",
    };
    const first = applyUpsertLegalDocumentToPersistedState(base, document);
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.alreadyApplied, false);
    assert.equal(first.state.legalDocuments[0]?.title, "Договор");

    const second = applyUpsertLegalDocumentToPersistedState(first.state, document);
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.alreadyApplied, true);
  });

  it("updates title and file on existing id", () => {
    const base = emptyState();
    const created = applyUpsertLegalDocumentToPersistedState(base, {
      id: "legal-1",
      title: "Старое",
      category: "Договоры",
      date: "2026-08-15",
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const updated = applyUpsertLegalDocumentToPersistedState(created.state, {
      id: "legal-1",
      title: "Новое",
      category: "Договоры",
      date: "2026-08-15",
      fileDataUrl: "data:application/pdf;base64,AAAA",
      fileName: "new.pdf",
    });
    assert.equal(updated.ok, true);
    if (!updated.ok) return;
    assert.equal(updated.state.legalDocuments[0]?.title, "Новое");
    assert.equal(updated.state.legalDocuments[0]?.fileName, "new.pdf");
  });

  it("deletes with tombstone", () => {
    const base = emptyState();
    const created = applyUpsertLegalDocumentToPersistedState(base, {
      id: "legal-1",
      title: "Удалить",
      category: "Договоры",
      date: "2026-08-15",
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const deleted = applyDeleteLegalDocumentToPersistedState(created.state, "legal-1");
    assert.equal(deleted.ok, true);
    if (!deleted.ok) return;
    assert.equal(deleted.state.legalDocuments.length, 0);
    assert.ok(deleted.state.deletedLegalDocumentIds?.includes("legal-1"));
  });
});
