"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import type { DisabilityGroup, Gender, Patient, PatientSource, PatientStatus } from "@/lib/types";
import {
  PatientAppointmentScheduleSection,
  buildAppointmentFromSchedule,
  validatePatientAppointmentSchedule,
  type PatientAppointmentScheduleFields,
} from "@/components/patients/patient-appointment-schedule-fields";
import {
  DISABILITY_LABELS,
  GENDER_LABELS,
  PATIENT_SOURCES,
  PATIENT_STATUS_LABELS,
  UI,
} from "@/lib/constants";
import {
  formatPassportNumber,
  formatPassportSeries,
  formatSnils,
  validatePassportNumber,
  validatePassportSeries,
  validatePhone,
  validateSnils,
} from "@/lib/document-validation";
import { normalizePhoneInput } from "@/lib/phone-utils";
import { PhoneInput } from "@/components/shared/phone-input";
import { useClinicStore } from "@/store/useClinicStore";
import { generateId } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PatientModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patient?: Patient | null;
  onCreated?: (patient: Patient) => void;
}

const selectClass =
  "flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm";

function emptyAppointmentFields(): PatientAppointmentScheduleFields {
  return {
    enabled: false,
    date: format(new Date(), "yyyy-MM-dd"),
    startTime: "10:00",
    durationMinutes: 30,
    doctorId: "",
    cabinetId: "",
    complaints: "",
  };
}

function emptyPatientFields() {
  return {
    firstName: "",
    lastName: "",
    middleName: "",
    phone: "+7",
    email: "",
    birthDate: "1990-01-01",
    gender: "female" as Gender,
    source: "Google" as PatientSource,
    status: "new" as PatientStatus,
    address: "",
    snils: "",
    passportSeries: "",
    passportNumber: "",
    diagnosis: "",
    hadPreviousVisits: false,
    previousVisitsNote: "",
    disability: "not_specified" as DisabilityGroup,
  };
}

export function PatientModal({ open, onOpenChange, patient, onCreated }: PatientModalProps) {
  const { addPatient, updatePatient, addAppointment, appointments, doctors, cabinets, patients } =
    useClinicStore();
  const [fields, setFields] = useState(emptyPatientFields);
  const [appointmentFields, setAppointmentFields] = useState(emptyAppointmentFields);
  const [docErrors, setDocErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setDocErrors({});
    if (patient) {
      setFields({
        firstName: patient.firstName,
        lastName: patient.lastName,
        middleName: patient.middleName ?? "",
        phone: patient.phone,
        email: patient.email ?? "",
        birthDate: patient.birthDate,
        gender: patient.gender,
        source: patient.source,
        status: patient.status,
        address: patient.address ?? "",
        snils: patient.snils ?? "",
        passportSeries: patient.passportSeries ?? "",
        passportNumber: patient.passportNumber ?? "",
        diagnosis: patient.diagnosis ?? "",
        hadPreviousVisits: patient.hadPreviousVisits ?? false,
        previousVisitsNote: patient.previousVisitsNote ?? "",
        disability: patient.disability ?? "not_specified",
      });
    } else {
      setFields(emptyPatientFields());
      setAppointmentFields({
        ...emptyAppointmentFields(),
        doctorId: doctors.find((d) => d.role === "doctor")?.id ?? "",
        cabinetId: cabinets[0]?.id ?? "",
      });
    }
  }, [open, patient, doctors, cabinets]);

  const set = <K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) => {
    setFields((prev) => ({ ...prev, [key]: value }));
    setDocErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleSave = () => {
    if (!fields.firstName.trim() || !fields.lastName.trim()) {
      toast.error("Укажите фамилию и имя");
      return;
    }

    const errors: Record<string, string> = {};
    const phoneCheck = validatePhone(fields.phone);
    if (!phoneCheck.valid) errors.phone = phoneCheck.message!;

    const snilsCheck = validateSnils(fields.snils);
    if (!snilsCheck.valid) errors.snils = snilsCheck.message!;

    const seriesCheck = validatePassportSeries(fields.passportSeries);
    if (!seriesCheck.valid) errors.passportSeries = seriesCheck.message!;

    const numberCheck = validatePassportNumber(fields.passportNumber);
    if (!numberCheck.valid) errors.passportNumber = numberCheck.message!;

    if (Object.keys(errors).length > 0) {
      setDocErrors(errors);
      toast.error("Проверьте документы и контакты");
      return;
    }

    const schedulePatientId = patient?.id;
    const scheduleError = validatePatientAppointmentSchedule(
      appointmentFields,
      appointments,
      patients,
      doctors,
      schedulePatientId
    );
    if (scheduleError) {
      toast.error(scheduleError);
      return;
    }

    const payload: Patient = {
      id: patient?.id ?? generateId("pat"),
      firstName: fields.firstName.trim(),
      lastName: fields.lastName.trim(),
      middleName: fields.middleName.trim() || undefined,
      phone: normalizePhoneInput(fields.phone),
      email: fields.email.trim() || undefined,
      birthDate: fields.birthDate,
      gender: fields.gender,
      source: fields.source,
      status: fields.status,
      address: fields.address.trim() || undefined,
      snils: formatSnils(fields.snils),
      passportSeries: formatPassportSeries(fields.passportSeries),
      passportNumber: formatPassportNumber(fields.passportNumber),
      diagnosis: fields.diagnosis.trim() || undefined,
      hadPreviousVisits: fields.hadPreviousVisits,
      previousVisitsNote: fields.hadPreviousVisits
        ? fields.previousVisitsNote.trim() || undefined
        : undefined,
      disability: fields.disability,
      createdAt: patient?.createdAt ?? format(new Date(), "yyyy-MM-dd"),
      balance: patient?.balance ?? 0,
      totalSpent: patient?.totalSpent ?? 0,
      allergies: patient?.allergies ?? [],
      chronicDiseases: patient?.chronicDiseases ?? [],
      lastVisitDate: patient?.lastVisitDate,
      nextVisitDate: patient?.nextVisitDate,
    };

    const saveAppointmentFor = (targetPatientId: string) => {
      if (!appointmentFields.enabled) return;
      const apt = {
        id: generateId("apt"),
        ...buildAppointmentFromSchedule(
          targetPatientId,
          appointmentFields,
          fields.diagnosis
        ),
      };
      addAppointment(apt);
      updatePatient(targetPatientId, { nextVisitDate: appointmentFields.date });
    };

    if (patient) {
      updatePatient(patient.id, payload);
      saveAppointmentFor(patient.id);
      toast.success(
        appointmentFields.enabled
          ? "Пациент обновлён и записан на приём"
          : "Пациент обновлён"
      );
    } else {
      addPatient(payload);
      saveAppointmentFor(payload.id);
      toast.success(
        appointmentFields.enabled
          ? "Пациент добавлен и записан на приём"
          : "Пациент добавлен"
      );
      onCreated?.(payload);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{patient ? "Редактировать пациента" : "Новый пациент"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Фамилия *</Label>
              <Input
                value={fields.lastName}
                onChange={(e) => set("lastName", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Имя *</Label>
              <Input
                value={fields.firstName}
                onChange={(e) => set("firstName", e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Отчество</Label>
            <Input
              value={fields.middleName}
              onChange={(e) => set("middleName", e.target.value)}
            />
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-3">
            <p className="text-xs font-medium text-slate-600">Документы *</p>
            <div className="space-y-2">
              <Label>{UI.snils}</Label>
              <Input
                value={fields.snils}
                onChange={(e) => set("snils", formatSnils(e.target.value))}
                placeholder="123-456-789 01"
                inputMode="numeric"
              />
              {docErrors.snils && (
                <p className="text-xs text-red-600">{docErrors.snils}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{UI.passportSeries}</Label>
                <Input
                  value={fields.passportSeries}
                  onChange={(e) =>
                    set("passportSeries", formatPassportSeries(e.target.value))
                  }
                  placeholder="4510"
                  inputMode="numeric"
                  maxLength={4}
                />
                {docErrors.passportSeries && (
                  <p className="text-xs text-red-600">{docErrors.passportSeries}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>{UI.passportNumber}</Label>
                <Input
                  value={fields.passportNumber}
                  onChange={(e) =>
                    set("passportNumber", formatPassportNumber(e.target.value))
                  }
                  placeholder="123456"
                  inputMode="numeric"
                  maxLength={6}
                />
                {docErrors.passportNumber && (
                  <p className="text-xs text-red-600">{docErrors.passportNumber}</p>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{UI.phone} *</Label>
              <PhoneInput value={fields.phone} onChange={(v) => set("phone", v)} required />
              {docErrors.phone && (
                <p className="text-xs text-red-600">{docErrors.phone}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>{UI.email}</Label>
              <Input
                type="email"
                value={fields.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Дата рождения</Label>
              <Input
                type="date"
                value={fields.birthDate}
                onChange={(e) => set("birthDate", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Пол</Label>
              <select
                className={selectClass}
                value={fields.gender}
                onChange={(e) => set("gender", e.target.value as Gender)}
              >
                {(Object.entries(GENDER_LABELS) as [Gender, string][]).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{UI.diagnosis}</Label>
            <Input
              value={fields.diagnosis}
              onChange={(e) => set("diagnosis", e.target.value)}
              placeholder="Основной диагноз или жалоба при поступлении"
            />
          </div>

          <div className="space-y-2">
            <Label>{UI.disability}</Label>
            <select
              className={selectClass}
              value={fields.disability}
              onChange={(e) => set("disability", e.target.value as DisabilityGroup)}
            >
              {(Object.entries(DISABILITY_LABELS) as [DisabilityGroup, string][]).map(
                ([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                )
              )}
            </select>
          </div>

          <div className="space-y-2 rounded-lg border border-slate-200 p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={fields.hadPreviousVisits}
                onChange={(e) => set("hadPreviousVisits", e.target.checked)}
                className="rounded border-slate-300"
              />
              Был на приёме ранее (в другой клинике или у нас)
            </label>
            {fields.hadPreviousVisits && (
              <textarea
                className="mt-2 min-h-[72px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={fields.previousVisitsNote}
                onChange={(e) => set("previousVisitsNote", e.target.value)}
                placeholder="Когда, где, что делали..."
              />
            )}
          </div>

          <div className="space-y-2">
            <Label>Адрес</Label>
            <Input
              value={fields.address}
              onChange={(e) => set("address", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Источник</Label>
              <select
                className={selectClass}
                value={fields.source}
                onChange={(e) => set("source", e.target.value as PatientSource)}
              >
                {PATIENT_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>{UI.status}</Label>
              <select
                className={selectClass}
                value={fields.status}
                onChange={(e) => set("status", e.target.value as PatientStatus)}
              >
                {Object.entries(PATIENT_STATUS_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <PatientAppointmentScheduleSection
            fields={appointmentFields}
            onChange={setAppointmentFields}
            patientId={patient?.id}
            diagnosisFallback={fields.diagnosis}
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {UI.cancel}
            </Button>
            <Button onClick={handleSave}>
              {appointmentFields.enabled ? "Сохранить и записать" : UI.save}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
