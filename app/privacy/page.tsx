import { LegalDocumentPage } from "@/components/marketing/legal-document-page";
import { privacyPolicyDoc } from "@/lib/platform-legal-docs";

export default function PrivacyPage() {
  return <LegalDocumentPage doc={privacyPolicyDoc} />;
}
