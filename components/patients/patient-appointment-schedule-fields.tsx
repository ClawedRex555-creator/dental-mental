"use client";

import { APPOINTMENT_DURATION_OPTIONS } from "@/lib/appointment-duration-options";
import {
  calcEndTime,
  findAppointmentConflicts,
} from "@/lib/appointment-utils";
import { getPrimaryScheduleConflict, formatAppointmentConflictMessage } from "@/lib/appointment-schedule-messages";
import { DENTAL_COMPLAINTS } from "@/lib/catalogs";
import { UI } from "@/lib/constants";
import type { Appointment, Cabinet, Doctor } from "@/lib/types";
import { SearchAutocomplete } from "@/components/shared/search-autocomplete";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useClinicStore } from "@/store/useClinicStore";

const selectClass =
  "flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900";

export interface PatientAppointmentScheduleFields {
  enabled: boolean;
  date: string;
  startTime: string;
  durationMinutes: number;
  doctorId: string;
  cabinetId: string;
  complaints: string;
}

interface PatientAppointmentScheduleSectionProps {
  fields: PatientAppointmentScheduleFields;
  onChange: (fields: PatientAppointmentScheduleFields) => void;
  patientId?: string;
  diagnosisFallback?: string;
}

export function PatientAppointmentScheduleSection({
  fields,
  onChange,
  patientId,
  diagnosisFallback = "",
}: PatientAppointmentScheduleSectionProps) {
  const { doctors, cabinets, appointments, patients } = useClinicStore();
  const activeDoctors = doctors.filter((d) => d.role === "doctor");

  const set = <K extends keyof PatientAppointmentScheduleFields>(
    key: K,
    value: PatientAppointmentScheduleFields[K]
  ) => onChange({ ...fields, [key]: value });

  const endTime = calcEndTime(fields.startTime, fields.durationMinutes);
  const conflicts =
    fields.enabled && fields.doctorId
      ? findAppointmentConflicts(appointments, {
          date: fields.date,
          startTime: fields.startTime,
          endTime,
          doctorId: fields.doctorId,
          cabinetId: fields.cabinetId || undefined,
          patientId,
        })
      : [];

  const conflictMsg =
    conflicts.length > 0
      ? formatAppointmentConflictMessage(
          getPrimaryScheduleConflict(conflicts)!,
          patients,
          doctors
        )
      : null;

  return (
    <div className="space-y-3 rounded-lg border border-teal-100 bg-teal-50/40 p-3">
      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-800">
        <input
          type="checkbox"
          checked={fields.enabled}
          onChange={(e) => set("enabled", e.target.checked)}
          className="rounded border-slate-300"
        />
        Записать на приём (необязательно)
      </label>

      {fields.enabled && (
        <div className="space-y-3 border-t border-teal-100 pt-3">
          {!fields.doctorId && (
            <p className="text-xs text-amber-800">
              Выберите врача — без этого нельзя проверить, свободен ли он в это время.
            </p>
          )}
          {conflictMsg && (
            <p className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800">
              {conflictMsg}
            </p>
          )}

          <SearchAutocomplete
            label="Жалобы на приём"
            value={fields.complaints}
            onChange={(v) => set("complaints", v)}
            catalog={DENTAL_COMPLAINTS}
            placeholder={
              diagnosisFallback
                ? "пусто — подставится диагноз"
                : "можно оставить пустым"
            }
          />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Дата</Label>
              <Input
                type="date"
                value={fields.date}
                onChange={(e) => set("date", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Время</Label>
              <Input
                type="time"
                value={fields.startTime}
                onChange={(e) => set("startTime", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Длительность приёма</Label>
              <select
                className={selectClass}
                value={fields.durationMinutes}
                onChange={(e) => set("durationMinutes", Number(e.target.value))}
              >
                {APPOINTMENT_DURATION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>
                {UI.doctor} <span className="text-red-600">*</span>
              </Label>
              <select
                className={selectClass}
                value={fields.doctorId}
                onChange={(e) => set("doctorId", e.target.value)}
              >
                <option value="">Выберите врача</option>
                {activeDoctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                    {d.specialization ? ` — ${d.specialization}` : ""}
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
                value={fields.cabinetId}
                onChange={(e) => set("cabinetId", e.target.value)}
              >
                <option value="">Не выбран</option>
                {cabinets.map((c: Cabinet) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function buildAppointmentFromSchedule(
  patientId: string,
  fields: PatientAppointmentScheduleFields,
  diagnosisFallback: string
): Omit<Appointment, "id"> {
  const complaints =
    fields.complaints.trim() || diagnosisFallback.trim() || "Первичный приём";
  const durationMinutes = fields.durationMinutes;
  return {
    patientId,
    doctorId: fields.doctorId || undefined,
    cabinetId: fields.cabinetId || undefined,
    date: fields.date,
    startTime: fields.startTime,
    endTime: calcEndTime(fields.startTime, durationMinutes),
    durationMinutes,
    status: "scheduled",
    complaints,
    reason: complaints,
    price: 0,
    paymentStatus: "pending",
  };
}

export function validatePatientAppointmentSchedule(
  fields: PatientAppointmentScheduleFields,
  appointments: Appointment[],
  patients: import("@/lib/types").Patient[],
  doctors: Doctor[],
  patientId?: string
): string | null {
  if (!fields.enabled) return null;
  if (!fields.doctorId) {
    return "Выберите врача, чтобы записать без наложения на других пациентов";
  }

  const endTime = calcEndTime(fields.startTime, fields.durationMinutes);
  const conflicts = findAppointmentConflicts(appointments, {
    date: fields.date,
    startTime: fields.startTime,
    endTime,
    doctorId: fields.doctorId,
    cabinetId: fields.cabinetId || undefined,
    patientId,
  });

  if (conflicts.length === 0) return null;
  return formatAppointmentConflictMessage(
    getPrimaryScheduleConflict(conflicts)!,
    patients,
    doctors
  );
}
