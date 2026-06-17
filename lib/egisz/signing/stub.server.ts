import "server-only";

import type { SignCdaOptions } from "@/lib/egisz/signing/interface";
import type { DocumentSigner, SignedDocument } from "@/lib/egisz/signing/interface";

/** Dev/test: имитация двойной КЭП (врач + МО) без CryptoPro */
function stubDetachedSign(role: "doctor" | "organization"): string {
  return Buffer.from(`STUB-DETACHED-SIGN-${role}-${new Date().toISOString()}`, "utf8").toString(
    "base64"
  );
}

export const stubDocumentSigner: DocumentSigner = {
  async signCda(xml: string, _options: SignCdaOptions): Promise<SignedDocument> {
    const dataBase64 = Buffer.from(xml, "utf8").toString("base64");
    const organizationSignBase64 = stubDetachedSign("organization");
    const personalSignBase64 = stubDetachedSign("doctor");
    return {
      xml,
      dataBase64,
      base64: dataBase64,
      organizationSignBase64,
      personalSignBase64,
      signatures: [
        { role: "doctor", stub: true },
        { role: "organization", stub: true },
      ],
    };
  },
};
