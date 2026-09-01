import "server-only";

export const DOCUMENT_SIGN_OTP_TTL_MS = 15 * 60 * 1000;
export const DOCUMENT_SIGN_MAX_OTP_ATTEMPTS = 5;

export {
  isFdocConfigured,
  resolveDocumentSignProvider,
  documentSignProviderLabel,
} from "@/lib/document-sign/fdoc/config.server";
