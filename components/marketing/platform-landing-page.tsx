import {
  BarChart3,
  CalendarClock,
  FileText,
  ShieldCheck,
  Stethoscope,
  Wallet,
} from "lucide-react";
import type { ClinicRecord } from "@/lib/clinic-db.server";
import { APP_NAME } from "@/lib/constants";
import { HiddenAdminLogo } from "@/components/platform/hidden-admin-logo";
import { Button } from "@/components/ui/button";
import { ConnectionRequestForm } from "@/components/marketing/connection-request-form";

interface PlatformLandingPageProps {
  rootDomain: string;
  clinics: ClinicRecord[];
  databaseEnabled: boolean;
}

const FEATURE_CARDS = [
  {
    title: "Расписание и приёмы",
    text: "Без накладок по кабинетам и врачам, с удобной ежедневной работой администратора.",
    icon: CalendarClock,
  },
  {
    title: "Пациенты и медкарты",
    text: "Единая карта пациента, визиты, диагнозы, рекомендации и план лечения.",
    icon: Stethoscope,
  },
  {
    title: "Финансы и документы",
    text: "Акты, счета, оплаты, договоры и юридические шаблоны в одном месте.",
    icon: Wallet,
  },
  {
    title: "Аналитика для владельца",
    text: "Ключевые показатели клиники: загрузка, выручка, динамика по сотрудникам.",
    icon: BarChart3,
  },
  {
    title: "ЕГИСЗ / N3 интеграция",
    text: "Подготовка СЭМД и отправка в контур по настроенному регламенту клиники.",
    icon: FileText,
  },
  {
    title: "Безопасность и роли",
    text: "Разделение прав доступа и защищённая модель хранения данных клиники.",
    icon: ShieldCheck,
  },
];

const SCHEDULE_PREVIEW = [
  { time: "09:00", name: "Иванова А. С.", doctor: "Ортопедия", tone: "bg-teal-100 text-teal-900" },
  { time: "10:00", name: "Петров Д. И.", doctor: "Терапия", tone: "bg-sky-100 text-sky-900" },
  { time: "11:30", name: "Смирнова Е. В.", doctor: "Хирургия", tone: "bg-amber-100 text-amber-900" },
  { time: "14:00", name: "Козлов М. А.", doctor: "Гигиена", tone: "bg-emerald-100 text-emerald-900" },
];

export function PlatformLandingPage({
  rootDomain,
  clinics,
  databaseEnabled,
}: PlatformLandingPageProps) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <HiddenAdminLogo className="mb-0 h-10 w-10" logoSize={40} />
            <p className="text-sm font-semibold">{APP_NAME}</p>
          </div>
          <Button size="sm" asChild>
            <a href="#request">Запросить демо</a>
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-10 px-4 py-8">
        <section className="grid gap-6 rounded-3xl bg-gradient-to-br from-[#f0f7ff] to-[#eefaf7] p-6 lg:grid-cols-2 lg:p-10">
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
              МИС нового поколения для стоматологий
            </p>
            <h1 className="text-3xl font-bold leading-tight sm:text-4xl">
              Управляйте клиникой легко и эффективно с {APP_NAME}
            </h1>
            <p className="text-slate-600">
              Расписание, пациенты, медкарты, финансы и документы в единой системе, с которой
              команде действительно удобно работать каждый день.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <a href="#request">Запросить демонстрацию</a>
              </Button>
              <Button variant="outline" asChild>
                <a href="#clinics">Клиники, которые нам доверяют</a>
              </Button>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Сегодня</p>
                <p className="text-2xl font-semibold">24</p>
                <p className="text-xs text-slate-500">приёма по расписанию</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Выручка за месяц</p>
                <p className="text-2xl font-semibold">1 250 000 ₽</p>
                <p className="text-xs text-slate-500">+12% к прошлому месяцу</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 sm:col-span-2">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-600">Расписание на сегодня</p>
                  <p className="text-xs text-slate-400">Кабинет 2</p>
                </div>
                <ul className="space-y-1.5">
                  {SCHEDULE_PREVIEW.map((row) => (
                    <li
                      key={row.time}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-xs ${row.tone}`}
                    >
                      <span className="w-10 shrink-0 font-mono font-semibold">{row.time}</span>
                      <span className="min-w-0 flex-1 truncate font-medium">{row.name}</span>
                      <span className="shrink-0 opacity-70">{row.doctor}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURE_CARDS.map(({ title, text, icon: Icon }) => (
            <article key={title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <Icon className="h-5 w-5 text-teal-700" />
              <h2 className="mt-3 text-base font-semibold">{title}</h2>
              <p className="mt-1 text-sm text-slate-600">{text}</p>
            </article>
          ))}
        </section>

        <section id="clinics" className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Клиники, которые нам доверяют</h2>
            <p className="mt-2 text-sm text-slate-600">
              Стоматологии уже работают в {APP_NAME}: ведут расписание, пациентов и документы в
              одном контуре.
            </p>
            {!databaseEnabled && (
              <p className="mt-3 text-xs text-amber-700">
                Сейчас включен dev-режим без PostgreSQL. Для production нужен `DATABASE_URL`.
              </p>
            )}
            {clinics.length > 0 ? (
              <ul className="mt-4 space-y-2">
                {clinics.slice(0, 8).map((clinic) => (
                  <li
                    key={clinic.id}
                    className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2.5 text-sm"
                  >
                    <span className="font-medium">{clinic.name}</span>
                    <span className="font-mono text-xs text-slate-400">
                      {clinic.slug}.{rootDomain}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Первые клиники уже подключаются. Оставьте заявку — поможем запуститься.
              </p>
            )}
            <p className="mt-4 text-xs text-slate-500">
              Сотрудники клиники входят через свой поддомен:{" "}
              <code className="text-teal-800">
                https://название.{rootDomain}
              </code>
            </p>
          </div>
          <section id="request">
            <ConnectionRequestForm />
          </section>
        </section>
      </main>
    </div>
  );
}
