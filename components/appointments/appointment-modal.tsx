"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { toast } from "sonner";
import type { Appointment, AppointmentStatus } from "@/lib/types";
import { DENTAL_COMPLAINTS } from "@/lib/catalogs";
import { APPOINTMENT_DURATION_OPTIONS } from "@/lib/appointment-duration-options";
import { calcEndTime, SCHEDULE_DAY_END, SCHEDULE_DAY_START } from "@/lib/appointment-utils";
import { resolveCabinetIdForDoctor } from "@/lib/cabinet-utils";
import { validateAppointmentSave } from "@/lib/validate-appointment-save";
import { workActHasFilledItems } from "@/lib/work-act-utils";
import {
  WorkActModal,
  type WorkActModalMode,
} from "@/components/finance/work-act-modal";
import { PatientModal } from "@/components/patients/patient-modal";
import { AppointmentDocumentsModal } from "@/components/appointments/appointment-documents-modal";
import { PatientSearchSelect } from "@/components/shared/patient-search-select";
import { SearchAutocomplete } from "@/components/shared/search-autocomplete";
import { APPOINTMENT_STATUS_LABELS, UI } from "@/lib/constants";
import { useIsModuleEnabled } from "@/components/clinic/module-guard";
import { useClinicStore } from "@/store/useClinicStore";
import { generateId, getFullName, formatDate, formatPhone } from "@/lib/utils";
import { canViewPatientPhone } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const selectClass =
  "flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-50 disabled:text-slate-500";

interface AppointmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment?: Appointment | null;
  defaultDate?: string;
  defaultDoctorId?: string;
  defaultTime?: string;
  onOpenAct?: (actId: string) => void;
}

export function AppointmentModal({
  open,
  onOpenChange,
  appointment,
  defaultDate,
  defaultDoctorId,
  defaultTime,
  onOpenAct,
}: AppointmentModalProps) {
  const {
    patients,
    doctors,
    cabinets,
    appointments,
    workActs,
    currentUser,
    addAppointment,
    updateAppointment,
  } = useClinicStore();
  const activeDoctors = doctors.filter((d) => d.role === "doctor");
  const assistants = doctors.filter((d) => d.role === "assistant");

  const userRole = currentUser.role;
  const isAdmin = userRole === "admin" || userRole === "owner";
  const isDoctor = userRole === "doctor";
  const legalEnabled = useIsModuleEnabled("legal");

  const [patientId, setPatientId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [assistantId, setAssistantId] = useState("");
  const [cabinetId, setCabinetId] = useState("");
  const [complaints, setComplaints] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [startTime, setStartTime] = useState("10:00");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [status, setStatus] = useState<AppointmentStatus>("scheduled");
  const [paymentStatus, setPaymentStatus] = useState<"pending" | "paid">("pending");

  const [actModalOpen, setActModalOpen] = useState(false);
  const [actMode, setActMode] = useState<WorkActModalMode>("standard");
  const [existingActId, setExistingActId] = useState<string | undefined>();
  const [docsModalOpen, setDocsModalOpen] = useState(false);

  useEffect(() => {
    if (!legalEnabled && docsModalOpen) setDocsModalOpen(false);
  }, [legalEnabled, docsModalOpen]);
  const [patientModalOpen, setPatientModalOpen] = useState(false);
  const [savedAppointmentId, setSavedAppointmentId] = useState<string | null>(null);
  const initialized = useRef(false);
  const prevStatus = useRef<AppointmentStatus>("scheduled");

  const linkedActId = useMemo(() => {
    if (!appointment) return undefined;
    return (
      appointment.workActId ??
      workActs.find((a) => a.appointmentId === appointment.id && a.actType !== "prepayment")?.id
    );
  }, [appointment, workActs]);

  const linkedAct = useMemo(() => {
    if (!linkedActId) return undefined;
    return workActs.find((a) => a.id === linkedActId);
  }, [linkedActId, workActs]);

  const linkedActPaid =
    appointment?.paymentStatus === "paid" || linkedAct?.paymentStatus === "paid";

  const selectedPatient = useMemo(
    () => patients.find((p) => p.id === patientId),
    [patients, patientId]
  );

  const doctorCanEdit = isDoctor && (appointment?.status === "in_progress" || status === "in_progress");
  const adminCanEdit = isAdmin || !appointment;
  const formLocked = !!appointment && !adminCanEdit && !doctorCanEdit;

  const statusOptions = useMemo(() => {
    if (isDoctor && appointment?.status === "in_progress") {
      return (["in_progress", "completed"] as AppointmentStatus[]).map((key) => ({
        key,
        label: APPOINTMENT_STATUS_LABELS[key],
      }));
    }
    return Object.entries(APPOINTMENT_STATUS_LABELS).map(([key, label]) => ({
      key: key as AppointmentStatus,
      label,
    }));
  }, [isDoctor, appointment?.status]);

  useEffect(() => {
    if (!open) {
      initialized.current = false;
      return;
    }
    if (initialized.current) return;
    initialized.current = true;

    if (appointment) {
      setPatientId(appointment.patientId);
      setDoctorId(appointment.doctorId ?? "");
      setAssistantId(appointment.assistantId ?? "");
      setCabinetId(appointment.cabinetId ?? "");
      setComplaints(appointment.complaints ?? appointment.reason ?? "");
      setDate(appointment.date);
      setStartTime(appointment.startTime);
      setDurationMinutes(appointment.durationMinutes ?? 30);
      setStatus(appointment.status);
      setPaymentStatus(appointment.paymentStatus === "paid" ? "paid" : "pending");
      prevStatus.current = appointment.status;

      if (appointment.status === "ready_for_payment" && isAdmin && linkedActId) {
        setExistingActId(linkedActId);
        setActMode(linkedAct && !workActHasFilledItems(linkedAct) ? "standard" : "admin_view");
      }
    } else {
      const initialDoctorId = defaultDoctorId ?? activeDoctors[0]?.id ?? "";
      setPatientId("");
      setDoctorId(initialDoctorId);
      setAssistantId("");
      setCabinetId(
        resolveCabinetIdForDoctor(initialDoctorId, doctors, cabinets) ??
          cabinets[0]?.id ??
          ""
      );
      setComplaints("");
      setDate(defaultDate ?? format(new Date(), "yyyy-MM-dd"));
      setStartTime(defaultTime ?? "10:00");
      setDurationMinutes(30);
      setStatus("scheduled");
      setPaymentStatus("pending");
      prevStatus.current = "scheduled";
    }
  }, [
    open,
    appointment,
    defaultDate,
    defaultDoctorId,
    defaultTime,
    patients,
    activeDoctors,
    cabinets,
    doctors,
    isAdmin,
    linkedActId,
    linkedAct,
  ]);

  const handleStatusChange = (next: AppointmentStatus) => {
    if (
      legalEnabled &&
      next === "arrived" &&
      prevStatus.current !== "arrived"
    ) {
      setDocsModalOpen(true);
    }
    setStatus(next);
  };

  const openDoctorAct = (aptId: string) => {
    setSavedAppointmentId(aptId);
    setExistingActId(undefined);
    setActMode("doctor");
    setActModalOpen(true);
  };

  const handleSave = () => {
    if (!patientId || !complaints.trim()) {
      toast.error("Укажите пациента и основные жалобы");
      return;
    }
    if (!doctorId) {
      toast.error("Выберите врача");
      return;
    }

    const endTime = calcEndTime(startTime, durationMinutes);
    const preservePaidStatus = appointment?.paymentStatus === "paid";
    const payload: Appointment = {
      id: appointment?.id ?? generateId("apt"),
      patientId,
      doctorId: doctorId || undefined,
      assistantId: assistantId || undefined,
      assistantHours: assistantId
        ? assistantId === appointment?.assistantId
          ? appointment?.assistantHours
          : undefined
        : undefined,
      cabinetId: cabinetId || undefined,
      date,
      startTime,
      endTime,
      durationMinutes,
      status,
      complaints: complaints.trim(),
      reason: complaints.trim(),
      price: appointment?.price ?? 0,
      paymentStatus: preservePaidStatus ? "paid" : "pending",
      workActId: appointment?.workActId,
    };

    const conflictError = validateAppointmentSave(appointments, payload, patients, doctors);
    if (conflictError) {
      toast.error(conflictError);
      return;
    }

    const wasInProgress = appointment?.status === "in_progress";
    const completingAsDoctor = isDoctor && wasInProgress && status === "completed";

    if (appointment) {
      updateAppointment(appointment.id, payload);
      toast.success("Запись обновлена");
    } else {
      addAppointment(payload);
      toast.success("Запись создана");
    }

    prevStatus.current = status;

    if (completingAsDoctor) {
      onOpenChange(false);
      openDoctorAct(payload.id);
      toast.info("Заполните акт оказанных услуг");
      return;
    }

    if (isAdmin && paymentStatus === "paid") {
      setSavedAppointmentId(payload.id);
      setActMode("standard");
      setExistingActId(undefined);
      onOpenChange(false);
      setActModalOpen(true);
      toast.info("Оформите акт оказанных услуг");
      return;
    }

    onOpenChange(false);
  };

  const showAppointmentForm = open;

  return (
    <>
      {showAppointmentForm && (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {appointment ? "Редактировать запись" : "Новая запись"}
              </DialogTitle>
            </DialogHeader>
            {formLocked && (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {appointment?.status === "ready_for_payment"
                  ? "Запись готова к оплате. Администратор может изменить статус или открыть акт."
                  : "Редактирование доступно администратору или врачу на приёме (статус «На приёме»)."}
              </p>
            )}
            {appointment?.status === "ready_for_payment" && isAdmin && linkedActId && (
              <Button
                className="w-full"
                onClick={() => {
                  setExistingActId(linkedActId);
                  setActMode(linkedAct && !workActHasFilledItems(linkedAct) ? "standard" : "admin_view");
                  setActModalOpen(true);
                }}
              >
                {linkedAct
                  ? workActHasFilledItems(linkedAct)
                    ? `Акт № ${linkedAct.actNumber || "—"} · готов к оплате`
                    : "Заполнить акт (услуги не указаны)"
                  : "Открыть или восстановить акт"}
              </Button>
            )}
            {linkedActId && linkedActPaid && (
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => {
                  if (onOpenAct) {
                    onOpenAct(linkedActId);
                    return;
                  }
                  setExistingActId(linkedActId);
                  setActMode("admin_view");
                  setActModalOpen(true);
                }}
              >
                {linkedAct ? `Акт № ${linkedAct.actNumber} · Оплачен` : "Открыть оплаченный акт"}
              </Button>
            )}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{UI.patient}</Label>
                <div className="flex gap-2">
                  <PatientSearchSelect
                    patients={patients}
                    selectedPatientId={patientId}
                    disabled={formLocked}
                    placeholder="ФИО или телефон..."
                    onSelect={(patient) => setPatientId(patient.id)}
                  />
                  {!formLocked && (
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0"
                      onClick={() => setPatientModalOpen(true)}
                    >
                      +
                    </Button>
                  )}
                </div>
              </div>

              {selectedPatient && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <p className="font-medium text-slate-900">
                        {getFullName(
                          selectedPatient.firstName,
                          selectedPatient.lastName,
                          selectedPatient.middleName
                        )}
                        {selectedPatient.isChild && (
                          <span className="ml-1.5 text-xs font-normal text-teal-700">
                            ребёнок
                          </span>
                        )}
                      </p>
                      <p className="text-slate-600">
                        {canViewPatientPhone(currentUser.role)
                          ? formatPhone(selectedPatient.phone)
                          : "—"}
                      </p>
                      <p className="text-slate-600">
                        Д.р. {formatDate(selectedPatient.birthDate)}
                      </p>
                      {selectedPatient.isChild && selectedPatient.representativeFullName && (
                        <p className="pt-1 text-xs text-slate-500">
                          Представитель: {selectedPatient.representativeFullName}
                          {selectedPatient.representativeBirthDate && (
                            <> · д.р. {formatDate(selectedPatient.representativeBirthDate)}</>
                          )}
                        </p>
                      )}
                    </div>
                    <Button variant="outline" size="sm" className="shrink-0" asChild>
                      <Link href={`/patients/${selectedPatient.id}`}>Карточка</Link>
                    </Button>
                  </div>
                </div>
              )}

              <SearchAutocomplete
                label="Основные жалобы"
                value={complaints}
                onChange={formLocked ? () => {} : setComplaints}
                catalog={DENTAL_COMPLAINTS}
                placeholder="боль, отёк, чувствительность..."
                required={!formLocked}
              />

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>
                    {UI.doctor} <span className="text-red-600">*</span>
                  </Label>
                  <select
                    className={selectClass}
                    value={doctorId}
                    disabled={formLocked}
                    onChange={(e) => {
                      const nextDoctorId = e.target.value;
                      setDoctorId(nextDoctorId);
                      const suggested = resolveCabinetIdForDoctor(
                        nextDoctorId,
                        doctors,
                        cabinets
                      );
                      setCabinetId(suggested ?? "");
                    }}
                  >
                    <option value="">Выберите врача</option>
                    {activeDoctors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Ассистент</Label>
                  <select
                    className={selectClass}
                    value={assistantId}
                    disabled={formLocked}
                    onChange={(e) => setAssistantId(e.target.value)}
                  >
                    <option value="">Нет</option>
                    {assistants.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {cabinets.length > 0 && (
                <div className="space-y-2">
                  <Label>Кабинет</Label>
                  <select
                    className={selectClass}
                    value={cabinetId}
                    disabled={formLocked}
                    onChange={(e) => setCabinetId(e.target.value)}
                  >
                    <option value="">Не указан</option>
                    {cabinets.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} №{c.number}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3 items-end">
                <div className="flex min-w-0 flex-col gap-2">
                  <Label className="flex min-h-10 items-end leading-snug">{UI.date}</Label>
                  <Input
                    type="date"
                    className="h-10"
                    value={date}
                    disabled={formLocked}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                  <Label className="flex min-h-10 items-end leading-snug">{UI.time}</Label>
                  <Input
                    type="time"
                    className="h-10"
                    min={SCHEDULE_DAY_START}
                    max={SCHEDULE_DAY_END}
                    value={startTime}
                    disabled={formLocked}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                  <Label className="flex min-h-10 items-end text-sm leading-snug">
                    Длительность приёма
                  </Label>
                  <select
                    className={selectClass}
                    value={durationMinutes}
                    disabled={formLocked}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  >
                    {APPOINTMENT_DURATION_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>{UI.status}</Label>
                  <select
                    className={selectClass}
                    value={status}
                    disabled={formLocked && !doctorCanEdit}
                    onChange={(e) => handleStatusChange(e.target.value as AppointmentStatus)}
                  >
                    {statusOptions.map(({ key, label }) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                {isAdmin && (
                  <div className="space-y-2">
                    <Label>Оплата</Label>
                    <select
                      className={selectClass}
                      value={paymentStatus}
                      disabled={formLocked}
                      onChange={(e) =>
                        setPaymentStatus(e.target.value as "pending" | "paid")
                      }
                    >
                      <option value="pending">Не оплачено</option>
                      <option value="paid">Оплатить</option>
                    </select>
                  </div>
                )}
              </div>

              {legalEnabled && patientId && (appointment?.status === "in_progress" || status === "in_progress") && (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={() => setDocsModalOpen(true)}
                >
                  Документы и печать во время приёма
                </Button>
              )}

              {!formLocked && (
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => onOpenChange(false)}>
                    {UI.cancel}
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={!patientId || !complaints.trim() || !doctorId}
                  >
                    {UI.save}
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      <PatientModal
        open={patientModalOpen}
        onOpenChange={setPatientModalOpen}
        initialAppointmentSchedule={
          patientModalOpen
            ? {
                enabled: true,
                date,
                startTime,
                durationMinutes,
                doctorId,
                cabinetId,
                complaints,
              }
            : undefined
        }
        onCreated={(p, meta) => {
          setPatientId(p.id);
          if (meta?.appointmentCreated) onOpenChange(false);
        }}
      />

      {legalEnabled && (
        <AppointmentDocumentsModal
          open={docsModalOpen}
          onOpenChange={setDocsModalOpen}
          onDone={() => undefined}
          patientId={patientId}
          doctorId={doctorId || undefined}
          appointmentDate={date}
        />
      )}

      <WorkActModal
        open={actModalOpen}
        onOpenChange={setActModalOpen}
        mode={actMode}
        existingActId={existingActId}
        defaultPatientId={patientId}
        defaultDoctorId={doctorId || undefined}
        defaultAppointmentId={savedAppointmentId ?? appointment?.id}
        onSubmitted={() => onOpenChange(false)}
      />
    </>
  );
}
