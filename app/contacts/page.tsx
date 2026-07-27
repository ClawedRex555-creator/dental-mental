import Link from "next/link";
import { PLATFORM_OPERATOR } from "@/lib/platform-legal";
import { PlatformPublicShell } from "@/components/marketing/platform-public-shell";

export default function ContactsPage() {
  const o = PLATFORM_OPERATOR;
  return (
    <PlatformPublicShell>
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <p className="text-xs text-slate-500">
          <Link href="/" className="text-teal-700 hover:underline">
            ← На главную
          </Link>
        </p>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Контакты
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Оператор сервиса Emkaro и сайта {o.siteUrl}.
        </p>

        <dl className="mt-8 space-y-5 text-sm">
          <div>
            <dt className="font-medium text-slate-900">Оператор</dt>
            <dd className="mt-1 text-slate-700">{o.legalName}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-900">Реквизиты</dt>
            <dd className="mt-1 text-slate-700">
              ИНН {o.inn}
              <br />
              ОГРНИП {o.ogrnip}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-900">Адрес регистрации</dt>
            <dd className="mt-1 text-slate-700">{o.registrationAddress}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-900">Email по персональным данным</dt>
            <dd className="mt-1">
              <a href={o.emailHref} className="text-teal-700 hover:underline">
                {o.email}
              </a>
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-900">Телефон</dt>
            <dd className="mt-1">
              <a href={o.phoneHref} className="text-teal-700 hover:underline">
                {o.phoneDisplay}
              </a>
            </dd>
          </div>
        </dl>

        <p className="mt-8 text-sm text-slate-600">
          Чтобы запросить демо или подключение клиники,{" "}
          <Link href="/#request" className="text-teal-700 hover:underline">
            оставьте заявку на главной
          </Link>
          .
        </p>
      </main>
    </PlatformPublicShell>
  );
}
