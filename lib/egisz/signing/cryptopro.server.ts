import "server-only";

import type { SignCdaOptions } from "@/lib/egisz/signing/interface";
import { resolveDoctorCertThumbprint } from "@/lib/egisz/signing/interface";
import type { DocumentSigner, SignedDocument } from "@/lib/egisz/signing/interface";

/**
 * Production: подпись через CryptoPro CSP / cadesplugin на сервере.
 * Требует установленного КриптоПро и доступа к контейнерам по thumbprint.
 */
export const cryptoproDocumentSigner: DocumentSigner = {
  async signCda(_xml: string, options: SignCdaOptions): Promise<SignedDocument> {
    const doctorThumbprint = resolveDoctorCertThumbprint(options);
    const orgThumbprint = options.config.orgCertThumbprint?.trim();
    if (!doctorThumbprint) {
      throw new Error(
        "CryptoPro: укажите отпечаток КЭП врача в карточке сотрудника (Сотрудники → врач → ЕГИСЗ)"
      );
    }
    if (!orgThumbprint) {
      throw new Error(
        "CryptoPro: укажите orgCertThumbprint в настройках ЕГИСЗ клиники"
      );
    }
    throw new Error(
      "CryptoPro signing не настроен на сервере. Используйте signing.mode=stub для тестов N3 или подключите cryptopro-cades CLI."
    );
  },
};
