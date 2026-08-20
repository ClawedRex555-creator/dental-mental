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
              {section.afterList?.map((p) => (
                <p key={p.slice(0, 48)} className="mt-3">
                  {p}
                </p>
              ))}
              {section.table && (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[32rem] border-collapse text-left text-xs sm:text-sm">
                    <thead>
                      <tr>
                        {section.table.headers.map((header) => (
                          <th
                            key={header}
                            className="border border-slate-200 bg-slate-50 px-2 py-1.5 font-semibold text-slate-800"
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {section.table.rows.map((row) => (
                        <tr key={row.join("|")}>
                          {row.map((cell, i) => (
                            <td
                              key={`${row[0]}-${i}`}
                              className="border border-slate-200 px-2 py-1.5 align-top"
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}
        </div>
      </article>
    </PlatformPublicShell>
  );
}
