import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { closeDialogThenNavigate, navigateHard } from "./dialog-navigation";

describe("dialog-navigation", () => {
  it("exports hard navigation helpers", () => {
    assert.equal(typeof navigateHard, "function");
    assert.equal(typeof closeDialogThenNavigate, "function");
  });
});
