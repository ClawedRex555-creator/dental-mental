import { LegalDocumentPage } from "@/components/marketing/legal-document-page";
import { cookiesPolicyDoc } from "@/lib/platform-legal-docs";

export default function CookiesPage() {
  return <LegalDocumentPage doc={cookiesPolicyDoc} />;
}
