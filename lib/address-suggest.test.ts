import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  collectKnownAddresses,
  filterKnownAddresses,
  mergeAddressSuggestions,
} from "./address-suggest";

describe("collectKnownAddresses", () => {
  it("dedupes and prefers frequent addresses", () => {
    const list = collectKnownAddresses([
      "г. Москва, ул. Ленина, 1",
      "  г. Москва, ул. Ленина, 1 ",
      "г. Ростов-на-Дону, ул. Садовая, 5",
      "г. Москва, ул. Ленина, 1",
      "",
      null,
    ]);
    assert.equal(list[0], "г. Москва, ул. Ленина, 1");
    assert.equal(list.length, 2);
  });
});

describe("filterKnownAddresses", () => {
  it("filters by substring", () => {
    const known = ["г. Москва, ул. Ленина, 1", "г. Ростов-на-Дону, ул. Садовая, 5"];
    const hits = filterKnownAddresses(known, "ростов");
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.value, "г. Ростов-на-Дону, ул. Садовая, 5");
    assert.equal(hits[0]?.source, "local");
  });

  it("ignores short queries", () => {
    assert.deepEqual(filterKnownAddresses(["Москва"], "м"), []);
  });
});

describe("mergeAddressSuggestions", () => {
  it("prefers local and dedupes", () => {
    const merged = mergeAddressSuggestions(
      [{ value: "ул. Ленина, 1", source: "local" }],
      [
        { value: "ул. Ленина, 1", source: "dadata" },
        { value: "ул. Ленина, 2", source: "dadata" },
      ]
    );
    assert.equal(merged.length, 2);
    assert.equal(merged[0]?.source, "local");
    assert.equal(merged[1]?.value, "ул. Ленина, 2");
  });
});
