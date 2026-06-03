import "server-only";

import type { EgiszSigningConfig } from "@/lib/egisz/types";

export interface SignedDocument {
  xml: string;
  base64: string;
  signatures: Array<{ role: "doctor" | "organization"; stub: boolean }>;
}

export interface SignCdaOptions {
  config: EgiszSigningConfig;
  /** Отпечаток КЭП врача из карточки сотрудника */
  doctorCertThumbprint?: string;
}

export interface DocumentSigner {
  signCda(xml: string, options: SignCdaOptions): Promise<SignedDocument>;
}

export function resolveDoctorCertThumbprint(options: SignCdaOptions): string | undefined {
  return (
    options.doctorCertThumbprint?.trim() ||
    options.config.doctorCertThumbprint?.trim() ||
    undefined
  );
}
