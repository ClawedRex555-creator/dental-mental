import { LegalDocumentPage } from "@/components/marketing/legal-document-page";
import { personalDataConsentDoc } from "@/lib/platform-legal-docs";

export default function PersonalDataConsentPage() {
  return <LegalDocumentPage doc={personalDataConsentDoc} />;
}
