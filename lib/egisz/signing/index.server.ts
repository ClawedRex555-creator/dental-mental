import "server-only";

import type { EgiszSigningConfig } from "@/lib/egisz/types";
import { cryptoproDocumentSigner } from "@/lib/egisz/signing/cryptopro.server";
import type { DocumentSigner, SignedDocument, SignCdaOptions } from "@/lib/egisz/signing/interface";
import { stubDocumentSigner } from "@/lib/egisz/signing/stub.server";

export function getDocumentSigner(config: EgiszSigningConfig): DocumentSigner {
  return config.mode === "cryptopro" ? cryptoproDocumentSigner : stubDocumentSigner;
}

export async function signCdaDocument(
  xml: string,
  options: SignCdaOptions
): Promise<SignedDocument> {
  return getDocumentSigner(options.config).signCda(xml, options);
}
