import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAllowedDataUrl, parseAllowedDataUrl } from "./safe-data-url";

const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("safe-data-url", () => {
  it("allows pdf and raster images", () => {
    assert.equal(isAllowedDataUrl(`data:image/png;base64,${PNG_B64}`), true);
    assert.equal(isAllowedDataUrl(`data:image/jpeg;base64,${PNG_B64}`), true);
    assert.equal(isAllowedDataUrl(`data:image/webp;base64,${PNG_B64}`), true);
    assert.equal(
      isAllowedDataUrl(`data:application/pdf;base64,JVBERi0xLjQKJeLjz9MK`),
      true
    );
  });

  it("rejects html and svg payloads", () => {
    const html = btoa("<script>alert(1)</script>");
    assert.equal(isAllowedDataUrl(`data:text/html;base64,${html}`), false);
    assert.equal(isAllowedDataUrl(`data:image/svg+xml;base64,${html}`), false);
  });

  it("rejects file extension tricks", () => {
    const html = btoa("<img onerror=alert(1)>");
    assert.equal(
      parseAllowedDataUrl(`data:text/html;base64,${html}`),
      null
    );
  });
});
