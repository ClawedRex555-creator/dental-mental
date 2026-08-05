"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarPlus,
  ClipboardList,
  CreditCard,
  MessageSquare,
  Pencil,
  Phone,
  Trash2,
} from "lucide-react";
import type { Appointment, Patient, PatientFile, TreatmentPlan } from "@/lib/types";
import {
  DISABILITY_LABELS,
  FILE_TYPE_LABELS,
  OTHER_CLINIC_VISIT_BADGE,
  PAYMENT_METHOD_LABELS,
} from "@/lib/constants";
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
import { logAuditClient } from "@/lib/audit-client";
import { readFileAsDataUrl } from "@/lib/open-stored-file";
import {
  canDeleteMedicalRecords,
  canDeletePatients,
  canDeleteTreatmentPlans,
  canViewPatientPhone,
} from "@/lib/rbac";
import {
  CLINIC_VISIT_STATUSES,
  countClinicVisits,
  otherClinicVisitId,
} from "@/lib/patient-visits";
import { PatientDebtPanel } from "@/components/patients/patient-debt-panel";
import { PatientModal } from "@/components/patients/patient-modal";
import { PatientNotesPanel } from "@/components/patients/patient-notes-panel";
import { PatientVisitDetailDialog } from "@/components/patients/patient-visit-detail-dialog";
import { WorkActModal } from "@/components/finance/work-act-modal";
import { findMedicalRecordForAppointment, findWorkActForAppointment } from "@/lib/visit-work-act";
import { isWorkActSyntheticVisit } from "@/lib/work-act-visit";
import { printWorkAct } from "@/lib/work-act-print";
import { getPatientDebtAmount } from "@/lib/patient-balance";
import { getOpenPrepaidSources } from "@/lib/prepayment-utils";

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
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [appointmentOpen, setAppointmentOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [prepayOpen, setPrepayOpen] = useState(false);
  const [prepayPlan, setPrepayPlan] = useState<TreatmentPlan | null>(null);
  const [editPatientOpen, setEditPatientOpen] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState<Appointment | null>(null);
  const [visitDetailOpen, setVisitDetailOpen] = useState(false);
  const [visitActId, setVisitActId] = useState<string | null>(null);
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
    clinicSettings,
    getPatientTeeth,
    updateTeeth,
    addPatientFile,
    currentUser,
    deletePatient,
    deleteMedicalRecord,
    deleteTreatmentPlan,
    syncOtherClinicVisitForPatient,
  } = useClinicStore();
  const canDelete = canDeletePatients(currentUser.role);
  const canDeletePlans = canDeleteTreatmentPlans(currentUser.role);
  const canDeleteRecords = canDeleteMedicalRecords(currentUser.role);
  const showPhone = canViewPatientPhone(currentUser.role);
  const patientName = getFullName(patient.firstName, patient.lastName, patient.middleName);

  useEffect(() => {
    logAuditClient({
      action: "view",
      resourceType: "patient",
      resourceId: patient.id,
    });
  }, [patient.id]);

  /** Старые карточки: галочка была, а записи в истории ещё нет */
  useEffect(() => {
    if (!patient.hadPreviousVisits) return;
    const visitId = otherClinicVisitId(patient.id);
    if (appointments.some((a) => a.id === visitId)) return;
    syncOtherClinicVisitForPatient(patient);
  }, [
    patient,
    patient.hadPreviousVisits,
    patient.previousVisitsNote,
    patient.createdAt,
    appointments,
    syncOtherClinicVisitForPatient,
  ]);

  const patientActs = workActs.filter((a) => a.patientId === patient.id);
  const patientAppointments = useMemo(
    () =>
      appointments
        .filter((a) => a.patientId === patient.id)
        .sort((a, b) => {
          if (a.isOtherClinicVisit && !b.isOtherClinicVisit) return 1;
          if (!a.isOtherClinicVisit && b.isOtherClinicVisit) return -1;
          const byDate = b.date.localeCompare(a.date);
          if (byDate !== 0) return byDate;
          return b.startTime.localeCompare(a.startTime);
        }),
    [appointments, patient.id]
  );
  const clinicVisitCount = countClinicVisits(appointments, patient.id);
  const completedVisits = patientAppointments.filter((a) =>
    CLINIC_VISIT_STATUSES.includes(a.status)
  );
  const records = medicalRecords.filter((r) => r.patientId === patient.id);
  const plans = treatmentPlans.filter((p) => p.patientId === patient.id);
  const patientPayments = payments.filter((p) => p.patientId === patient.id);
  const patientPrepaidSources = useMemo(
    () => getOpenPrepaidSources(prepayments, workActs, payments, patient.id),
    [prepayments, workActs, payments, patient.id]
  );
  const files = patientFiles.filter((f) => f.patientId === patient.id);
  const notes = patientNotes.filter((n) => n.patientId === patient.id);
  const notesCount = notes.length + (patient.notes?.trim() ? 1 : 0);
  const latestTeamNote = useMemo(
    () =>
      [...notes].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0],
    [notes]
  );
  const teeth = getPatientTeeth(patient.id);
  const activePlan = plans.find((p) => ["accepted", "in_progress", "proposed"].includes(p.status));
  const debtAmount = getPatientDebtAmount(patient.balance);

  const selectedVisitWorkAct = useMemo(() => {
    if (!selectedVisit) return undefined;
    return findWorkActForAppointment(selectedVisit, workActs, records);
  }, [selectedVisit, workActs, records]);

  const selectedVisitRecord = useMemo(() => {
    if (!selectedVisit) return undefined;
    return findMedicalRecordForAppointment(selectedVisit, records, selectedVisitWorkAct);
  }, [selectedVisit, records, selectedVisitWorkAct]);

  const openVisitDetail = (apt: Appointment) => {
    setSelectedVisit(apt);
    setVisitDetailOpen(true);
  };

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
            <p className="mt-2 text-sm text-slate-600">
              {getAge(patient.birthDate)} лет
              {showPhone ? ` · ${formatPhone(patient.phone)}` : ""}
              {patient.email && ` · ${patient.email}`}
            </p>
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <span>
                Баланс:{" "}
                <strong
                  className={patient.balance < 0 ? "text-red-600" : "text-slate-900"}
                >
                  {formatCurrency(patient.balance)}
                </strong>
                {debtAmount > 0 && (
                  <span className="ml-1 text-red-600">(долг {formatCurrency(debtAmount)})</span>
                )}
              </span>
              <span>Последний визит: {formatDate(patient.lastVisitDate)}</span>
              <span>Следующий: {formatDate(patient.nextVisitDate)}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditPatientOpen(true)}>
              <Pencil className="mr-2 h-4 w-4" />
              Редактировать
            </Button>
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
            {showPhone && (
              <Button variant="secondary" size="sm" asChild>
                <a href={`tel:${patient.phone}`}>
                  <Phone className="mr-2 h-4 w-4" />
                  Позвонить
                </a>
              </Button>
            )}
            {canDelete && (
              <Button
                variant="outline"
                size="sm"
                className="border-red-200 text-red-700 hover:bg-red-50"
                onClick={() => {
                  if (
                    !window.confirm(
                      `Удалить пациента «${patientName}»?\n\nБудут удалены все визиты, медкарта, планы, финансы и файлы. Действие нельзя отменить.`
                    )
                  ) {
                    return;
                  }
                  if (deletePatient(patient.id)) {
                    logAuditClient({
                      action: "delete",
                      resourceType: "patient",
                      resourceId: patient.id,
                    });
                    toast.success("Пациент удалён");
                    router.push("/patients");
                  } else {
                    toast.error("Не удалось удалить пациента");
                  }
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Удалить
              </Button>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-t-lg px-4 py-2.5 text-sm font-medium",
              tab === t
                ? "border-b-2 border-teal-600 bg-teal-50/50 text-teal-800"
                : "text-slate-600 hover:bg-slate-50"
            )}
          >
            {TAB_LABELS[t]}
            {t === "notes" && notesCount > 0 && (
              <span className="rounded-full bg-teal-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {notesCount}
              </span>
            )}
          </button>
        ))}
      </div>
      {tab === "overview" && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base">Основные данные</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p><span className="text-slate-500">Источник:</span> {patient.source}</p>
              <p><span className="text-slate-500">Адрес:</span> {patient.address || "—"}</p>
              <p><span className="text-slate-500">СНИЛС{patient.isChild ? " ребёнка" : ""}:</span> {patient.snils || "—"}</p>
              {patient.isChild && !patient.snils && (
                <p className="text-xs text-slate-500">
                  Если СНИЛС ещё не выдан — это нормально. Для ЕГИСЗ позже понадобится свой номер
                  ребёнка или отметка «без документов» при создании карточки.
                </p>
              )}
              {patient.isChild ? (
                <>
                  <p>
                    <span className="text-slate-500">Свидетельство о рождении:</span>{" "}
                    {patient.birthCertificateSeries && patient.birthCertificateNumber
                      ? `${patient.birthCertificateSeries} ${patient.birthCertificateNumber}`
                      : "—"}
                  </p>
                  <p>
                    <span className="text-slate-500">Представитель:</span>{" "}
                    {patient.representativeFullName || "—"}
                    {patient.representativeBirthDate && (
                      <> · д.р. {formatDate(patient.representativeBirthDate)}</>
                    )}
                  </p>
                  <p>
                    <span className="text-slate-500">Паспорт представителя:</span>{" "}
                    {patient.representativePassportSeries && patient.representativePassportNumber
                      ? `${patient.representativePassportSeries} ${patient.representativePassportNumber}`
                      : "—"}
                  </p>
                </>
              ) : (
                <p>
                  <span className="text-slate-500">Паспорт:</span>{" "}
                  {patient.passportSeries && patient.passportNumber
                    ? `${patient.passportSeries} ${patient.passportNumber}`
                    : "—"}
                </p>
              )}
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
              <p>
                <span className="font-medium">Приёмы у нас:</span>{" "}
                {clinicVisitCount > 0
                  ? `${clinicVisitCount} (${completedVisits.length} с визитом)`
                  : "пока нет завершённых визитов"}
              </p>
              {patient.hadPreviousVisits && (
                <p>
                  <span className="font-medium">Другая клиника (до нас):</span>{" "}
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
          {(patient.notes?.trim() || notes.length > 0) && (
            <Card className="md:col-span-2 border-amber-200/60">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <MessageSquare className="h-4 w-4 text-amber-700" />
                  Заметки
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setTab("notes")}>
                  Все заметки
                </Button>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {patient.notes?.trim() && (
                  <p className="rounded-lg bg-amber-50/80 px-3 py-2 text-slate-800">
                    <span className="text-xs font-medium text-amber-800">Важно: </span>
                    {patient.notes}
                  </p>
                )}
                {latestTeamNote && (
                  <p className="text-slate-600 line-clamp-2">
                    <span className="text-slate-500">{latestTeamNote.author}: </span>
                    {latestTeamNote.text}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
      {tab === "appointments" && (
        <Card>
          <CardContent className="divide-y p-0">
            {patientAppointments.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">
                Визитов пока нет
              </p>
            ) : (
              patientAppointments.map((apt) => {
                const doctor = doctors.find((d) => d.id === apt.doctorId);
                const isOther = apt.isOtherClinicVisit;
                const isActVisit = isWorkActSyntheticVisit(apt);
                const visitAct = findWorkActForAppointment(apt, workActs, records);
                return (
                  <button
                    key={apt.id}
                    type="button"
                    onClick={() => openVisitDetail(apt)}
                    className="flex w-full justify-between gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">
                        {isOther
                          ? "Визит в другой клинике (до нас)"
                          : isActVisit
                            ? `Акт · ${formatDate(apt.date)}`
                            : `${formatDate(apt.date)} ${apt.startTime}`}
                      </p>
                      <p className="text-slate-500">
                        {isOther
                          ? apt.complaints?.trim() || "Без описания"
                          : `${apt.complaints ?? apt.reason ?? "—"} · ${doctor?.name ?? "врач не назначен"}`}
                      </p>
                      {visitAct && (
                        <p className="mt-1 text-xs text-teal-700">
                          Акт № {visitAct.actNumber}
                          {visitAct.notes?.trim() ? " · есть примечание" : ""}
                        </p>
                      )}
                      {isOther && apt.reason && (
                        <p className="mt-1 text-xs text-amber-800">{apt.reason}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {isOther ? (
                        <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                          {OTHER_CLINIC_VISIT_BADGE}
                        </span>
                      ) : (
                        <AppointmentStatusBadge status={apt.status} />
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>
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
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{r.diagnosis}</CardTitle>
                    {canDeleteRecords && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                        title="Удалить запись"
                        onClick={() => {
                          if (
                            !window.confirm(
                              `Удалить запись медкарты «${r.diagnosis}»?\n\nАкты и планы останутся, привязка к этой записи будет снята.`
                            )
                          ) {
                            return;
                          }
                          if (deleteMedicalRecord(r.id)) {
                            void logAuditClient({
                              action: "delete",
                              resourceType: "medical_record",
                              resourceId: r.id,
                              metadata: { diagnosis: r.diagnosis, patientId: r.patientId },
                            });
                            toast.success("Запись медкарты удалена");
                          } else {
                            toast.error("Не удалось удалить запись");
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
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
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle>{plan.title}</CardTitle>
                      <p className="text-sm font-medium text-teal-700">
                        {formatCurrency(plan.finalAmount)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {plan.items.length} услуг · нажмите, чтобы редактировать
                      </p>
                    </div>
                    {canDeletePlans && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                        title="Удалить план"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (
                            !window.confirm(
                              `Удалить план «${plan.title}»?\n\nСвязанная заметка будет удалена. Акты и предоплаты в «Финансы» останутся.`
                            )
                          ) {
                            return;
                          }
                          if (deleteTreatmentPlan(plan.id)) {
                            void logAuditClient({
                              action: "delete",
                              resourceType: "treatment_plan",
                              resourceId: plan.id,
                              metadata: { title: plan.title, patientId: plan.patientId },
                            });
                            toast.success("План лечения удалён");
                          } else {
                            toast.error("Не удалось удалить план");
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardHeader>
              </Card>
            ))
          )}
        </>
      )}
      {tab === "finance" && (
        <div className="space-y-4">
          <PatientDebtPanel patient={patient} />
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setPrepayOpen(true)}>
              <CreditCard className="mr-2 h-4 w-4" />
              Внести предоплату
            </Button>
          </div>
          {patientPrepaidSources.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Предоплаты</CardTitle>
              </CardHeader>
              <CardContent className="divide-y p-0">
                {patientPrepaidSources.map((source) => (
                  <div key={source.id} className="space-y-2 px-4 py-3 text-sm">
                    <div className="flex justify-between gap-2">
                      <span className="font-medium">{formatDate(source.date)}</span>
                      <span className="text-xs text-slate-500">{source.label}</span>
                    </div>
                    <p className="text-xs text-slate-500">
                      {source.kind === "partial_act"
                        ? "Частично оплаченный акт"
                        : "Документ предоплаты"}
                    </p>
                    {source.serviceNames.length > 0 && (
                      <ul className="text-slate-600">
                        {source.serviceNames.slice(0, 6).map((name, i) => (
                          <li key={`${source.id}-${i}`}>{name}</li>
                        ))}
                      </ul>
                    )}
                    <div className="flex flex-wrap gap-3 text-xs">
                      <span className="text-teal-700">
                        Внесено: {formatCurrency(source.credit)}
                      </span>
                      <span className="text-amber-700">
                        Остаток: {formatCurrency(source.remaining)}
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
                  void readFileAsDataUrl(file)
                    .then((dataUrl) => {
                      addPatientFile({
                        id: `pf_${Date.now()}`,
                        patientId: patient.id,
                        name: file.name,
                        type: file.type.startsWith("image/") ? "photo" : "document",
                        uploadedAt: new Date().toISOString().slice(0, 10),
                        dataUrl,
                      });
                    })
                    .catch(() => {
                      toast.error("Допустимы только PDF, PNG, JPEG или WebP");
                    });
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
      {tab === "notes" && <PatientNotesPanel patient={patient} notes={notes} />}
      <PatientVisitDetailDialog
        open={visitDetailOpen}
        onOpenChange={(open) => {
          setVisitDetailOpen(open);
          if (!open) setSelectedVisit(null);
        }}
        appointment={selectedVisit}
        patient={patient}
        doctor={
          selectedVisit?.doctorId
            ? doctors.find((d) => d.id === selectedVisit.doctorId)
            : undefined
        }
        workAct={selectedVisitWorkAct}
        medicalRecord={selectedVisitRecord}
        onOpenAct={(actId) => {
          setVisitActId(actId);
          setVisitDetailOpen(false);
        }}
        onPrintAct={(act) => printWorkAct(act, patient, clinicSettings)}
      />
      <WorkActModal
        open={!!visitActId}
        onOpenChange={(open) => !open && setVisitActId(null)}
        existingActId={visitActId ?? undefined}
        mode="admin_view"
        onGoToPayment={(actId) => {
          setVisitActId(null);
          window.setTimeout(() => {
            window.location.assign(`/finance?tab=acts&payAct=${actId}`);
          }, 50);
        }}
      />
      <AppointmentModal
        open={appointmentOpen}
        onOpenChange={setAppointmentOpen}
        onGoToPayment={(actId) => {
          setAppointmentOpen(false);
          window.setTimeout(() => {
            window.location.assign(`/finance?tab=acts&payAct=${actId}`);
          }, 50);
        }}
      />
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
        onRequestPrepayment={(plan) => {
          setEditingPlan(null);
          setPrepayPlan(plan);
          setPrepayOpen(true);
        }}
      />
      <PrepaymentModal
        open={prepayOpen}
        onOpenChange={(open) => {
          setPrepayOpen(open);
          if (!open) setPrepayPlan(null);
        }}
        defaultPatientId={patient.id}
        defaultTreatmentPlan={prepayPlan}
      />
      <PatientModal
        open={editPatientOpen}
        onOpenChange={setEditPatientOpen}
        patient={patient}
      />
    </div>
  );
}
