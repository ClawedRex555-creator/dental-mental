import Link from "next/link";
import { APP_LOGO_TEXT, APP_NAME, APP_TAGLINE } from "@/lib/constants";
import { clinicBaseUrl, getAppRootDomain } from "@/lib/clinic-host";
import { listClinics } from "@/lib/clinic-db.server";
import { isDatabaseEnabled } from "@/lib/db";
import { HiddenAdminLogo } from "@/components/platform/hidden-admin-logo";

export const dynamic = "force-dynamic";

export default async function PlatformHomePage() {
  const rootDomain = getAppRootDomain();
  const clinics = isDatabaseEnabled() ? await listClinics() : [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="mx-auto max-w-3xl px-4 py-16">
        <div className="mb-10 text-center">
          <HiddenAdminLogo>{APP_LOGO_TEXT}</HiddenAdminLogo>
          <h1 className="text-3xl font-bold text-slate-900">{APP_NAME}</h1>
          <p className="mt-2 text-slate-600">{APP_TAGLINE}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Вход для сотрудников</h2>
          <p className="mt-2 text-sm text-slate-600">
            Откройте поддомен вашей клиники:
          </p>
          <p className="mt-3 rounded-lg bg-slate-50 px-4 py-3 font-mono text-sm text-teal-800">
            https://<span className="font-semibold">название</span>.{rootDomain}
          </p>
          <p className="mt-3 text-xs text-slate-500">
            Пример: <code className="text-teal-700">ulybka.{rootDomain}</code> → страница входа
            клиники «Улыбка».
          </p>
        </div>

        {clinics.length > 0 && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Клиники на сервере</h2>
            <ul className="mt-4 space-y-2">
              {clinics.map((c) => (
                <li key={c.id}>
                  <Link
                    href={clinicBaseUrl(c.slug)}
                    className="flex items-center justify-between rounded-lg border border-slate-100 px-4 py-3 text-sm hover:border-teal-200 hover:bg-teal-50/50"
                  >
                    <span className="font-medium text-slate-900">{c.name}</span>
                    <span className="font-mono text-teal-700">{c.slug}.{rootDomain}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!isDatabaseEnabled() && (
          <p className="mt-6 text-center text-sm text-amber-700">
            Режим разработки без PostgreSQL. Задайте <code>DATABASE_URL</code> на сервере для
            multi-clinic.
          </p>
        )}
      </div>
    </div>
  );
}
