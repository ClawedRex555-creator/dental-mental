import Link from "next/link";
import type { LegalDocument } from "@/lib/platform-legal-docs";
import { PLATFORM_OPERATOR } from "@/lib/platform-legal";
import { PlatformPublicShell } from "@/components/marketing/platform-public-shell";

export function LegalDocumentPage({ doc }: { doc: LegalDocument }) {
  return (
    <PlatformPublicShell>
      <article className="mx-auto w-full max-w-3xl px-4 py-10">
        <p className="text-xs text-slate-500">
          <Link href="/" className="text-teal-700 hover:underline">
            ← На главную
          </Link>
        </p>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          {doc.title}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Дата редакции: {doc.updatedAt} · Оператор: {PLATFORM_OPERATOR.legalName}
        </p>
        <div className="mt-8 space-y-8 text-sm leading-relaxed text-slate-700">
          {doc.sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-base font-semibold text-slate-900">{section.title}</h2>
              {section.paragraphs.map((p, i) => (
                <p key={`${section.title}-${i}`} className="mt-3">
                  {p}
                </p>
              ))}
              {section.list && section.list.length > 0 && (
                <ul className="mt-3 list-disc space-y-1 pl-5">
                  {section.list.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
        <p className="mt-10 border-t border-slate-200 pt-4 text-xs text-slate-500">
          {doc.footerNote}
        </p>
      </article>
    </PlatformPublicShell>
  );
}
