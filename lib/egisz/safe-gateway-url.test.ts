import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertSafeEgiszGatewayUrl } from "./safe-gateway-url";

describe("assertSafeEgiszGatewayUrl", () => {
  it("accepts public https gateway", () => {
    const url = assertSafeEgiszGatewayUrl("https://b2b-demo.n3health.ru/emk/");
    assert.match(url, /^https:\/\//);
  });

  it("rejects link-local metadata", () => {
    assert.throws(
      () =>
        assertSafeEgiszGatewayUrl("https://169.254.169.254/", { requireHttps: true }),
      /Запрещён/
    );
  });

  it("rejects localhost", () => {
    assert.throws(() => assertSafeEgiszGatewayUrl("https://localhost/emk"), /Запрещён/);
  });

  it("rejects http in live/https-required mode", () => {
    assert.throws(
      () => assertSafeEgiszGatewayUrl("http://example.com/emk", { requireHttps: true }),
      /HTTPS/
    );
  });
});
