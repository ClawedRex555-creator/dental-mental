import "server-only";

import type { SignCdaOptions } from "@/lib/egisz/signing/interface";
import type { DocumentSigner, SignedDocument } from "@/lib/egisz/signing/interface";

/** Dev/test: имитация двойной КЭП (врач + МО) без CryptoPro */
export const stubDocumentSigner: DocumentSigner = {
  async signCda(xml: string, _options: SignCdaOptions): Promise<SignedDocument> {
    const marker = `\n<!-- STUB-SIGN doctor+org ${new Date().toISOString()} -->`;
    const signedXml = `${xml}${marker}`;
    const base64 = Buffer.from(signedXml, "utf8").toString("base64");
    return {
      xml: signedXml,
      base64,
      signatures: [
        { role: "doctor", stub: true },
        { role: "organization", stub: true },
      ],
    };
  },
};
