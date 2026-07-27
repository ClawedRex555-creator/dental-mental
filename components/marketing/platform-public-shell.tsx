import Link from "next/link";
import { APP_NAME } from "@/lib/constants";
import { PLATFORM_OPERATOR, operatorRequisitesLines } from "@/lib/platform-legal";
import { HiddenAdminLogo } from "@/components/platform/hidden-admin-logo";
import { Button } from "@/components/ui/button";
import { CookieConsentBanner } from "@/components/marketing/cookie-consent-banner";

export function PlatformPublicShell({
  children,
  showRequestCta = true,
}: {
  children: React.ReactNode;
  showRequestCta?: boolean;
}) {
  const lines = operatorRequisitesLines();
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-3">
            <HiddenAdminLogo className="mb-0 h-10 w-10" logoSize={40} />
            <p className="text-sm font-semibold">{APP_NAME}</p>
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link href={PLATFORM_OPERATOR.contactsPath} className="hidden text-slate-600 hover:text-slate-900 sm:inline">
              Контакты
            </Link>
            {showRequestCta && (
              <Button size="sm" asChild>
                <Link href="/#request">Запросить демо</Link>
              </Button>
            )}
          </nav>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 sm:grid-cols-[1.2fr_1fr]">
          <div className="space-y-1 text-xs leading-relaxed text-slate-600">
            {lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-600 sm:justify-end">
            <Link href={PLATFORM_OPERATOR.privacyPath} className="hover:text-teal-800 hover:underline">
              Политика ПДн
            </Link>
            <Link href={PLATFORM_OPERATOR.consentPath} className="hover:text-teal-800 hover:underline">
              Согласие на обработку ПДн
            </Link>
            <Link href={PLATFORM_OPERATOR.cookiesPath} className="hover:text-teal-800 hover:underline">
              Cookies
            </Link>
            <Link href={PLATFORM_OPERATOR.contactsPath} className="hover:text-teal-800 hover:underline">
              Контакты
            </Link>
          </div>
        </div>
        <div className="border-t border-slate-100 px-4 py-3 text-center text-[11px] text-slate-400">
          © {new Date().getFullYear()} {APP_NAME}. Черновики правовых текстов — рекомендуется проверка юристом.
        </div>
      </footer>

      <CookieConsentBanner />
    </div>
  );
}
