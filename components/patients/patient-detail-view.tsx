"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarPlus, ClipboardList, CreditCard, Phone } from "lucide-react";
import type { Patient, PatientFile, TreatmentPlan } from "@/lib/types";
import { DISABILITY_LABELS, FILE_TYPE_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { useClinicStore } from "@/store/useClinicStore";
import { cn, formatCurrency, formatDate, formatPhone, getAge, getFullName } from "@/lib/utils";
import { AppointmentModal } from "@/components/appointments/appointment-modal";
import { PrepaymentModal } from "@/components/finance/prepayment-modal";
import { MedicalRecordModal } from "@/components/medical-records/medical-record-modal";
import { TreatmentPlanModal } from "@/components/treatment-plans/treatment-plan-modal";
import { DentalChart } from "@/components/medical-records/dental-chart";
import { PatientStatusBadge, AppointmentStatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const TABS = ["overview", "appointments", "records", "teeth", "plans", "finance", "files", "notes"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  overview: "Обзор",
  appointments: "История визитов",
  records: "Медкарта",
  teeth: "Зубная формула",
  plans: "План лечения",
  finance: "Финансы",
  files: "Файлы",
  notes: "Заметки",
};

export function PatientDetailView({ patient }: { patient: Patient }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [appointmentOpen, setAppointmentOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [prepayOpen, setPrepayOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<TreatmentPlan | null>(null);
  const {
    appointments,
    medicalRecords,
    treatmentPlans,
    payments,
    workActs,
    prepayments,
    patientFiles,
    patientNotes,
    doctors,
    services,
    getPatientTeeth,
    updateTeeth,
    addPatientFile,
  } = useClinicStore();
  const patientActs = workActs.filter((a) => a.patientId === patient.id);
  const patientAppointments = appointments.filter((a) => a.patientId === patient.id);
  const records = medicalRecords.filter((r) => r.patientId === patient.id);
  const plans = treatmentPlans.filter((p) => p.patientId === patient.id);
  const patientPayments = payments.filter((p) => p.patientId === patient.id);
  const patientPrepayments = prepayments.filter((p) => p.patientId === patient.id);
  const files = patientFiles.filter((f) => f.patientId === patient.id);
  const notes = patientNotes.filter((n) => n.patientId === patient.id);
  const teeth = getPatientTeeth(patient.id);
  const activePlan = plans.find((p) => ["accepted", "in_progress", "proposed"].includes(p.status));

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <Link href="/patients" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-teal-700">
          <ArrowLeft className="h-4 w-4" /> К списку пациентов
        </Link>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900">{getFullName(patient.firstName, patient.lastName, patient.middleName)}</h1>
              <PatientStatusBadge status={patient.status} />
            </div>
            <p className="mt-2 text-sm text-slate-600">{getAge(patient.birthDate)} лет · {formatPhone(patient.phone)}{patient.email && ` · ${patient.email}`}</p>
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <span>Баланс: <strong className={patient.balance < 0 ? "text-red-600" : "text-slate-900"}>{formatCurrency(patient.balance)}</strong></span>
              <span>Последний визит: {formatDate(patient.lastVisitDate)}</span>
              <span>Следующий: {formatDate(patient.nextVisitDate)}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setAppointmentOpen(true)}>
              <CalendarPlus className="mr-2 h-4 w-4" />Записать
            </Button>
            <Button variant="outline" size="sm" onClick={() => setRecordOpen(true)}>
              Медкарта
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPlanOpen(true)}>
              <ClipboardList className="mr-2 h-4 w-4" />План лечения
            </Button>
            <Button size="sm" onClick={() => setPrepayOpen(true)}>
              <CreditCard className="mr-2 h-4 w-4" />
              Предоплата
            </Button>
            <Button variant="secondary" size="sm" asChild><a href={`tel:${patient.phone}`}><Phone className="mr-2 h-4 w-4" />Позвонить</a></Button>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={cn("rounded-t-lg px-4 py-2.5 text-sm font-medium", tab === t ? "border-b-2 border-teal-600 bg-teal-50/50 text-teal-800" : "text-slate-600 hover:bg-slate-50")}>{TAB_LABELS[t]}</button>
        ))}
      </div>
      {tab === "overview" && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base">Основные данные</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p><span className="text-slate-500">Источник:</span> {patient.source}</p>
              <p><span className="text-slate-500">Адрес:</span> {patient.address || "—"}</p>
              <p><span className="text-slate-500">СНИЛС:</span> {patient.snils || "—"}</p>
              <p>
                <span className="text-slate-500">Паспорт:</span>{" "}
                {patient.passportSeries && patient.passportNumber
                  ? `${patient.passportSeries} ${patient.passportNumber}`
                  : "—"}
              </p>
              <p>
                <span className="text-slate-500">Инвалидность:</span>{" "}
                {DISABILITY_LABELS[patient.disability ?? "not_specified"]}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Здоровье</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                <span className="font-medium">Диагноз:</span> {patient.diagnosis || "—"}
              </p>
              <p>
                <span className="font-medium">Аллергии:</span>{" "}
                {patient.allergies?.length ? patient.allergies.join(", ") : "нет"}
              </p>
              {patient.hadPreviousVisits && (
                <p>
                  <span className="font-medium">Ранние визиты:</span>{" "}
                  {patient.previousVisitsNote || "да, без описания"}
                </p>
              )}
            </CardContent>
          </Card>
          {activePlan && (
            <Card className="md:col-span-2">
              <CardHeader><CardTitle className="text-base">Активный план</CardTitle></CardHeader>
              <CardContent>
                <p className="font-medium">{activePlan.title}</p>
                <p className="text-sm text-slate-500">{formatCurrency(activePlan.finalAmount)}</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
      {tab === "appointments" && (
        <Card><CardContent className="divide-y p-0">{patientAppointments.map((apt) => { const doctor = doctors.find((d) => d.id === apt.doctorId); const service = services.find((s) => s.id === apt.serviceId); return (
          <div key={apt.id} className="flex justify-between px-4 py-3 text-sm"><div><p className="font-medium">{formatDate(apt.date)} {apt.startTime}</p><p className="text-slate-500">{apt.complaints ?? apt.reason ?? "—"} · {doctor?.name ?? "врач не назначен"}</p></div><div className="flex items-center gap-2"><AppointmentStatusBadge status={apt.status} /></div></div>
        ); })}</CardContent></Card>
      )}
      {tab === "records" && (
        <div className="space-y-4">
          {patientActs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Счета и оказанные услуги (акты)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {patientActs.map((act) => (
                  <div key={act.id} className="rounded-lg border border-slate-100 p-3 text-sm">
                    <p className="font-medium">
                      Акт № {act.actNumber} · {formatDate(act.actDate)} ·{" "}
                      {formatCurrency(act.totalAmount)}
                    </p>
                    <ul className="mt-2 list-inside list-disc text-slate-600">
                      {act.items.map((it) => (
                        <li key={it.id}>
                          {it.serviceName} — {formatCurrency(it.total)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          {records.length === 0 && patientActs.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-slate-500">
                Записей в медкарте пока нет
              </CardContent>
            </Card>
          ) : (
            records.map((r) => (
              <Card key={r.id}>
                <CardHeader>
                  <CardTitle className="text-base">{r.diagnosis}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  <p>
                    <span className="text-slate-500">Жалобы:</span> {r.complaints}
                  </p>
                  <p>
                    <span className="text-slate-500">Лечение:</span> {r.treatment}
                  </p>
                  {r.workActId && (
                    <p className="text-teal-700 text-xs">Привязан акт оказанных услуг</p>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
      {tab === "teeth" && <DentalChart teeth={teeth} onUpdate={(u) => updateTeeth(patient.id, u)} />}
      {tab === "plans" && (
        <>
          <Button
            size="sm"
            className="mb-2"
            onClick={() => {
              setEditingPlan(null);
              setPlanOpen(true);
            }}
          >
            <ClipboardList className="mr-2 h-4 w-4" />
            Добавить план
          </Button>
          {plans.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-slate-500">
                Планов нет
              </CardContent>
            </Card>
          ) : (
            plans.map((plan) => (
              <Card
                key={plan.id}
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => {
                  setEditingPlan(plan);
                  setPlanOpen(true);
                }}
              >
                <CardHeader>
                  <CardTitle>{plan.title}</CardTitle>
                  <p className="text-sm text-teal-700 font-medium">
                    {formatCurrency(plan.finalAmount)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {plan.items.length} услуг · нажмите, чтобы редактировать
                  </p>
                </CardHeader>
              </Card>
            ))
          )}
        </>
      )}
      {tab === "finance" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setPrepayOpen(true)}>
              <CreditCard className="mr-2 h-4 w-4" />
              Внести предоплату
            </Button>
          </div>
          {patientPrepayments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Предоплаты</CardTitle>
              </CardHeader>
              <CardContent className="divide-y p-0">
                {patientPrepayments.map((pre) => (
                  <div key={pre.id} className="space-y-2 px-4 py-3 text-sm">
                    <div className="flex justify-between gap-2">
                      <span className="font-medium">{formatDate(pre.date)}</span>
                      {pre.actNumber && (
                        <span className="text-xs text-slate-500">№ {pre.actNumber}</span>
                      )}
                    </div>
                    <ul className="text-slate-600">
                      {pre.items.map((it, i) => (
                        <li key={i} className="flex justify-between">
                          <span>{it.serviceName}</span>
                          <span>{formatCurrency(it.price)}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="flex flex-wrap gap-3 text-xs">
                      <span>План: {formatCurrency(pre.totalAmount)}</span>
                      <span className="text-teal-700">Внесено: {formatCurrency(pre.paidAmount)}</span>
                      <span className="text-amber-700">
                        Остаток: {formatCurrency(pre.remainingAmount)}
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Платежи</CardTitle>
            </CardHeader>
            <CardContent className="divide-y p-0">
              {patientPayments.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-500">Платежей нет</p>
              ) : (
                patientPayments.map((pay) => (
                  <div
                    key={pay.id}
                    className="flex justify-between px-4 py-3 text-sm"
                  >
                    <span>
                      {formatDate(pay.date)} · {PAYMENT_METHOD_LABELS[pay.method]}
                    </span>
                    <span className="text-emerald-700">{formatCurrency(pay.amount)}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}
      {tab === "files" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Документы и фото</CardTitle>
            <label className="cursor-pointer">
              <span className="inline-flex h-9 items-center rounded-lg bg-teal-600 px-3 text-sm text-white">
                Загрузить
              </span>
              <input
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    addPatientFile({
                      id: `pf_${Date.now()}`,
                      patientId: patient.id,
                      name: file.name,
                      type: file.type.startsWith("image/") ? "photo" : "document",
                      uploadedAt: new Date().toISOString().slice(0, 10),
                      dataUrl: reader.result as string,
                    });
                  };
                  reader.readAsDataURL(file);
                  e.target.value = "";
                }}
              />
            </label>
          </CardHeader>
          <CardContent className="divide-y p-0">
            {files.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">Файлов нет</p>
            ) : (
              files.map((f) => (
                <div key={f.id} className="flex justify-between gap-4 px-4 py-3 text-sm">
                  <div>
                    <span className="font-medium">{f.name}</span>
                    {f.dataUrl && f.type === "photo" && (
                      <img
                        src={f.dataUrl}
                        alt=""
                        className="mt-2 max-h-32 rounded border object-cover"
                      />
                    )}
                  </div>
                  <Badge variant="outline">
                    {FILE_TYPE_LABELS[f.type as PatientFile["type"]] ?? f.type}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}
      {tab === "notes" && <Card><CardContent className="space-y-3 pt-6">{notes.map((n) => <div key={n.id} className="rounded-lg border p-4 text-sm"><p className="font-medium">{n.author}</p><p className="mt-1">{n.text}</p></div>)}</CardContent></Card>}
      <AppointmentModal open={appointmentOpen} onOpenChange={setAppointmentOpen} />
      <MedicalRecordModal
        open={recordOpen}
        onOpenChange={setRecordOpen}
        defaultPatientId={patient.id}
      />
      <TreatmentPlanModal
        open={planOpen}
        onOpenChange={(open) => {
          setPlanOpen(open);
          if (!open) setEditingPlan(null);
        }}
        plan={editingPlan}
        defaultPatientId={patient.id}
      />
      <PrepaymentModal
        open={prepayOpen}
        onOpenChange={setPrepayOpen}
        defaultPatientId={patient.id}
      />
    </div>
  );
}
