"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import type {
  Appointment,
  DisabilityGroup,
  Gender,
  Patient,
  PatientSource,
  PatientStatus,
} from "@/lib/types";
import { closeDialogThenNavigate } from "@/lib/dialog-navigation";
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
  digitsOnly,
  formatBirthCertificateNumber,
  formatPassportNumber,
  formatPassportSeries,
  formatSnils,
  validateBirthCertificateNumber,
  validateBirthCertificateSeries,
  validatePassportNumber,
  validatePassportSeries,
  validatePhone,
  validateSnils,
} from "@/lib/document-validation";
import { normalizePhoneInput } from "@/lib/phone-utils";
import { canViewPatientPhone } from "@/lib/rbac";
import { PhoneInput } from "@/components/shared/phone-input";
import {
  getPatientDebtAmount,
  parseDebtInput,
  resolveBalanceFromDebt,
} from "@/lib/patient-balance";
import { countClinicVisits, derivePatientVisitFields } from "@/lib/patient-visits";
import { resolveCabinetIdForDoctor } from "@/lib/cabinet-utils";
import {
  findDuplicatePatient,
  PATIENT_DUPLICATE_REASON_LABELS,
  type PatientDuplicateMatch,
} from "@/lib/patient-duplicate";
import { formatDate, generateId, getFullName } from "@/lib/utils";
import { createAppointmentViaCommandApi } from "@/lib/clinic-appointment.client";
import { upsertPatientViaCommandApi } from "@/lib/clinic-patient.client";
import {
  beginClinicEditorSession,
  endClinicEditorSession,
  markClinicSyncedAfterCommand,
  notifyClinicDataChanged,
} from "@/lib/clinic-data-sync.client";
import {
  beginClinicCommandMutation,
  endClinicCommandMutation,
  runWithoutClinicFlush,
  useClinicStore,
} from "@/store/useClinicStore";
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
  /** Prefill schedule when creating a patient from the appointments grid. */
  initialAppointmentSchedule?: Partial<PatientAppointmentScheduleFields>;
  onCreated?: (patient: Patient, meta?: { appointmentCreated?: boolean }) => void;
}

const selectClass = "select-field";

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
    isChild: false,
    birthCertificateSeries: "",
    birthCertificateNumber: "",
    representativeFullName: "",
    representativeBirthDate: "",
    representativePassportSeries: "",
    representativePassportNumber: "",
    diagnosis: "",
    hadPreviousVisits: false,
    previousVisitsNote: "",
    disability: "not_specified" as DisabilityGroup,
    notifyConsent: false,
    telegramChatId: "",
  };
}

export function PatientModal({
  open,
  onOpenChange,
  patient,
  initialAppointmentSchedule,
  onCreated,
}: PatientModalProps) {
  const {
    addPatient,
    updatePatient,
    addAppointment,
    syncOtherClinicVisitForPatient,
    appointments,
    doctors,
    cabinets,
    patients,
    currentUser,
  } = useClinicStore();
  const showPhone = canViewPatientPhone(currentUser.role);
  const [fields, setFields] = useState(emptyPatientFields);
  const [appointmentFields, setAppointmentFields] = useState(emptyAppointmentFields);
  const [docErrors, setDocErrors] = useState<Record<string, string>>({});
  const [withoutDocuments, setWithoutDocuments] = useState(false);
  const [debtAmount, setDebtAmount] = useState("");
  const [duplicateMatch, setDuplicateMatch] = useState<PatientDuplicateMatch | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const formInitialized = useRef(false);
  const formSessionKey = useRef<string>("");

  const clinicVisitCount = patient
    ? countClinicVisits(appointments, patient.id)
    : 0;
  const clinicLastVisit = patient
    ? derivePatientVisitFields(patient, appointments).lastVisitDate
    : undefined;

  // Пока модалка открыта — фоновый pull не перетирает store (см. isClinicEditorSessionOpen)
  useEffect(() => {
    if (!open) return;
    beginClinicEditorSession();
    return () => endClinicEditorSession();
  }, [open]);

  useEffect(() => {
    if (!open) {
      formInitialized.current = false;
      formSessionKey.current = "";
      return;
    }

    // Сессия: create | edit:<id>. Не зависеть от doctors/cabinets — pull меняет ссылки.
    const sessionKey = patient?.id ? `edit:${patient.id}` : "create";
    if (formInitialized.current && formSessionKey.current === sessionKey) {
      return;
    }
    formInitialized.current = true;
    formSessionKey.current = sessionKey;

    // Актуальные справочники на момент открытия (не в deps — иначе reset на sync)
    const storeDoctors = useClinicStore.getState().doctors;
    const storeCabinets = useClinicStore.getState().cabinets;

    setDocErrors({});
    setDuplicateMatch(null);
    if (patient) {
      const hasDocs =
        Boolean(digitsOnly(patient.snils ?? "")) ||
        Boolean(digitsOnly(patient.passportSeries ?? "")) ||
        Boolean(digitsOnly(patient.passportNumber ?? ""));
      setWithoutDocuments(patient.withoutIdentityDocuments ?? !hasDocs);
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
        isChild: patient.isChild ?? false,
        birthCertificateSeries: patient.birthCertificateSeries ?? "",
        birthCertificateNumber: patient.birthCertificateNumber ?? "",
        representativeFullName: patient.representativeFullName ?? "",
        representativeBirthDate: patient.representativeBirthDate ?? "",
        representativePassportSeries: patient.representativePassportSeries ?? "",
        representativePassportNumber: patient.representativePassportNumber ?? "",
        diagnosis: patient.diagnosis ?? "",
        hadPreviousVisits: patient.hadPreviousVisits ?? false,
        previousVisitsNote: patient.previousVisitsNote ?? "",
        disability: patient.disability ?? "not_specified",
        notifyConsent: patient.notificationPrefs?.consentForNotifications ?? false,
        telegramChatId: patient.notificationPrefs?.telegramChatId ?? "",
      });
      const debt = getPatientDebtAmount(patient.balance);
      setDebtAmount(debt > 0 ? String(debt) : "");
    } else {
      setWithoutDocuments(false);
      setDebtAmount("");
      setFields(emptyPatientFields());
      const schedule = initialAppointmentSchedule;
      const initialDoctorId =
        schedule?.doctorId ||
        storeDoctors.find((d) => d.role === "doctor")?.id ||
        "";
      const initialCabinetId =
        schedule?.cabinetId ||
        resolveCabinetIdForDoctor(initialDoctorId, storeDoctors, storeCabinets) ||
        storeCabinets[0]?.id ||
        "";
      setAppointmentFields({
        ...emptyAppointmentFields(),
        doctorId: initialDoctorId,
        cabinetId: initialCabinetId,
        ...schedule,
      });
    }
    // initialAppointmentSchedule читается только при первой init-сессии
    // eslint-disable-next-line react-hooks/exhaustive-deps -- form session, not store pulls
  }, [open, patient?.id]);

  const set = <K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) => {
    setFields((prev) => ({ ...prev, [key]: value }));
    setDocErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleSave = () => {
    if (savingRef.current) return;
    if (!fields.firstName.trim() || !fields.lastName.trim()) {
      toast.error("Укажите фамилию и имя");
      return;
    }

    const errors: Record<string, string> = {};
    if (showPhone) {
      const phoneCheck = validatePhone(fields.phone);
      if (!phoneCheck.valid) errors.phone = phoneCheck.message!;
    }

    if (!withoutDocuments) {
      const snilsDigits = digitsOnly(fields.snils);
      if (!fields.isChild || snilsDigits) {
        const snilsCheck = validateSnils(fields.snils);
        if (!snilsCheck.valid) errors.snils = snilsCheck.message!;
      }

      if (fields.isChild) {
        const bcSeriesCheck = validateBirthCertificateSeries(fields.birthCertificateSeries);
        if (!bcSeriesCheck.valid) errors.birthCertificateSeries = bcSeriesCheck.message!;

        const bcNumberCheck = validateBirthCertificateNumber(fields.birthCertificateNumber);
        if (!bcNumberCheck.valid) errors.birthCertificateNumber = bcNumberCheck.message!;

        const repSeriesCheck = validatePassportSeries(fields.representativePassportSeries);
        if (!repSeriesCheck.valid) {
          errors.representativePassportSeries = repSeriesCheck.message!;
        }

        const repNumberCheck = validatePassportNumber(fields.representativePassportNumber);
        if (!repNumberCheck.valid) {
          errors.representativePassportNumber = repNumberCheck.message!;
        }
      } else {
        const seriesCheck = validatePassportSeries(fields.passportSeries);
        if (!seriesCheck.valid) errors.passportSeries = seriesCheck.message!;

        const numberCheck = validatePassportNumber(fields.passportNumber);
        if (!numberCheck.valid) errors.passportNumber = numberCheck.message!;
      }
    }

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

    const previousBalance = patient?.balance ?? 0;
    const parsedDebt = parseDebtInput(debtAmount);
    if (fields.status === "debtor" && !patient && parsedDebt <= 0) {
      toast.error("Укажите сумму долга для статуса «Должник»");
      return;
    }

    const { balance, status } =
      fields.status === "debtor"
        ? resolveBalanceFromDebt("debtor", parsedDebt, previousBalance)
        : { balance: previousBalance, status: fields.status };

    const payload: Patient = {
      id: patient?.id ?? generateId("pat"),
      firstName: fields.firstName.trim(),
      lastName: fields.lastName.trim(),
      middleName: fields.middleName.trim() || undefined,
      phone: showPhone
        ? normalizePhoneInput(fields.phone)
        : patient?.phone ?? normalizePhoneInput(fields.phone),
      email: fields.email.trim() || undefined,
      birthDate: fields.birthDate,
      gender: fields.gender,
      source: fields.source,
      status,
      address: fields.address.trim() || undefined,
      withoutIdentityDocuments: withoutDocuments,
      snils:
        withoutDocuments || !digitsOnly(fields.snils)
          ? undefined
          : formatSnils(fields.snils),
      passportSeries: withoutDocuments
        ? undefined
        : fields.isChild
          ? undefined
          : formatPassportSeries(fields.passportSeries),
      passportNumber: withoutDocuments
        ? undefined
        : fields.isChild
          ? undefined
          : formatPassportNumber(fields.passportNumber),
      isChild: fields.isChild || undefined,
      birthCertificateSeries:
        withoutDocuments || !fields.isChild
          ? undefined
          : fields.birthCertificateSeries.trim() || undefined,
      birthCertificateNumber:
        withoutDocuments || !fields.isChild
          ? undefined
          : formatBirthCertificateNumber(fields.birthCertificateNumber) || undefined,
      representativeFullName:
        withoutDocuments || !fields.isChild
          ? undefined
          : fields.representativeFullName.trim() || undefined,
      representativeBirthDate:
        withoutDocuments || !fields.isChild || !fields.representativeBirthDate
          ? undefined
          : fields.representativeBirthDate,
      representativePassportSeries:
        withoutDocuments || !fields.isChild
          ? undefined
          : formatPassportSeries(fields.representativePassportSeries),
      representativePassportNumber:
        withoutDocuments || !fields.isChild
          ? undefined
          : formatPassportNumber(fields.representativePassportNumber),
      diagnosis: fields.diagnosis.trim() || undefined,
      hadPreviousVisits: fields.hadPreviousVisits,
      previousVisitsNote: fields.hadPreviousVisits
        ? fields.previousVisitsNote.trim() || undefined
        : undefined,
      disability: fields.disability,
      createdAt: patient?.createdAt ?? format(new Date(), "yyyy-MM-dd"),
      balance,
      totalSpent: patient?.totalSpent ?? 0,
      allergies: patient?.allergies ?? [],
      chronicDiseases: patient?.chronicDiseases ?? [],
      lastVisitDate: patient?.lastVisitDate,
      nextVisitDate: patient?.nextVisitDate,
      notificationPrefs: fields.notifyConsent
        ? {
            consentForNotifications: true,
            notificationsEnabled: true,
            consentDate:
              patient?.notificationPrefs?.consentDate ?? format(new Date(), "yyyy-MM-dd"),
            telegramChatId: fields.telegramChatId.trim() || undefined,
          }
        : {
            consentForNotifications: false,
            notificationsEnabled: false,
          },
    };

    const saveAppointmentFor = (targetPatient: Patient) => {
      if (!appointmentFields.enabled) return;
      const apt: Appointment = {
        id: generateId("apt"),
        ...buildAppointmentFromSchedule(
          targetPatient.id,
          appointmentFields,
          fields.diagnosis
        ),
      };
      void (async () => {
        const apiResult = await createAppointmentViaCommandApi(apt, {
          patient: targetPatient,
        });
        if (!apiResult.ok) {
          toast.error(
            apiResult.error ?? "Пациент сохранён, но запись на приём не создалась"
          );
          return;
        }
        runWithoutClinicFlush(() => {
          addAppointment(apt, { skipFlush: true });
          updatePatient(targetPatient.id, { nextVisitDate: appointmentFields.date });
        });
        markClinicSyncedAfterCommand(apiResult.updatedAt, apiResult.revision);
      })();
    };

    if (patient) {
      const conflict = findDuplicatePatient(
        patients,
        {
          phone: payload.phone,
          snils: payload.snils,
          passportSeries: payload.passportSeries,
          passportNumber: payload.passportNumber,
          firstName: payload.firstName,
          lastName: payload.lastName,
          middleName: payload.middleName,
          birthDate: payload.birthDate,
          isChild: payload.isChild,
        },
        patient.id
      );
      if (conflict) {
        setDuplicateMatch(conflict);
        return;
      }
    } else {
      const duplicate = findDuplicatePatient(patients, {
        phone: payload.phone,
        snils: payload.snils,
        passportSeries: payload.passportSeries,
        passportNumber: payload.passportNumber,
        firstName: payload.firstName,
        lastName: payload.lastName,
        middleName: payload.middleName,
        birthDate: payload.birthDate,
        isChild: payload.isChild,
      });
      if (duplicate) {
        setDuplicateMatch(duplicate);
        return;
      }
    }

    const patientToSave: Patient = appointmentFields.enabled
      ? { ...payload, nextVisitDate: appointmentFields.date }
      : payload;

    savingRef.current = true;
    setSaving(true);
    beginClinicCommandMutation();
    void (async () => {
      try {
        // Узкий command API: полный PUT + preferServer-pull откатывали ФИО.
        const apiResult = await upsertPatientViaCommandApi(patientToSave);
        if (!apiResult.ok) {
          toast.error(apiResult.error ?? "Не удалось сохранить пациента на сервере");
          return;
        }

        runWithoutClinicFlush(() => {
          if (patient) {
            updatePatient(patient.id, patientToSave);
            syncOtherClinicVisitForPatient(patientToSave);
          } else {
            addPatient(patientToSave);
            syncOtherClinicVisitForPatient(patientToSave);
          }
        });
        markClinicSyncedAfterCommand(apiResult.updatedAt, apiResult.revision);
        // Пока полный snapshot PUT ещё жив — не дать ему улететь следом и откатить ФИО.
        useClinicStore.getState().pauseClinicAutoSave(15_000);
        notifyClinicDataChanged();

        saveAppointmentFor(patientToSave);
        toast.success(
          appointmentFields.enabled
            ? patient
              ? "Пациент обновлён и записан на приём"
              : "Пациент добавлен и записан на приём"
            : patient
              ? "Пациент обновлён"
              : "Пациент добавлен"
        );
        if (!patient) {
          onCreated?.(patientToSave, { appointmentCreated: appointmentFields.enabled });
        }
        onOpenChange(false);
      } finally {
        endClinicCommandMutation();
        savingRef.current = false;
        setSaving(false);
      }
    })();
  };

  const duplicateName = duplicateMatch
    ? getFullName(
        duplicateMatch.patient.firstName,
        duplicateMatch.patient.lastName,
        duplicateMatch.patient.middleName
      )
    : "";

  const goToDuplicateCard = () => {
    if (!duplicateMatch) return;
    const id = duplicateMatch.patient.id;
    setDuplicateMatch(null);
    closeDialogThenNavigate(() => onOpenChange(false), `/patients/${id}`);
  };

  return (
    <>
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

          <div className="form-panel space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="form-panel-title">
                Документы{withoutDocuments ? "" : " *"}
              </p>
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[var(--foreground)]">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-[var(--border)] accent-[var(--primary)]"
                  checked={withoutDocuments}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setWithoutDocuments(checked);
                    if (checked) {
                      setFields((prev) => ({
                        ...prev,
                        snils: "",
                        passportSeries: "",
                        passportNumber: "",
                        birthCertificateSeries: "",
                        birthCertificateNumber: "",
                        representativeFullName: "",
                        representativeBirthDate: "",
                        representativePassportSeries: "",
                        representativePassportNumber: "",
                      }));
                      setDocErrors((prev) => {
                        const next = { ...prev };
                        delete next.snils;
                        delete next.passportSeries;
                        delete next.passportNumber;
                        delete next.birthCertificateSeries;
                        delete next.birthCertificateNumber;
                        delete next.representativePassportSeries;
                        delete next.representativePassportNumber;
                        return next;
                      });
                    }
                  }}
                />
                Без СНИЛС и паспорта
              </label>
            </div>
            <div
              className={
                withoutDocuments ? "pointer-events-none space-y-3 opacity-70" : "space-y-3"
              }
            >
            <div className="space-y-2">
              <Label>{fields.isChild ? "СНИЛС ребёнка" : UI.snils}</Label>
              <Input
                value={fields.snils}
                onChange={(e) => set("snils", formatSnils(e.target.value))}
                placeholder="123-456-789 01"
                inputMode="numeric"
                disabled={withoutDocuments}
              />
              {fields.isChild && !withoutDocuments && (
                <p className="text-xs text-[var(--muted)]">
                  Указывается <strong>свой СНИЛС ребёнка</strong>, если уже выдан. СНИЛС
                  родителя сюда не вносите. Если номера ещё нет — оставьте поле пустым.
                </p>
              )}
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
                  disabled={withoutDocuments || fields.isChild}
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
                  disabled={withoutDocuments || fields.isChild}
                />
                {docErrors.passportNumber && (
                  <p className="text-xs text-red-600">{docErrors.passportNumber}</p>
                )}
              </div>
            </div>
            {fields.isChild && !withoutDocuments && (
              <p className="text-xs text-[var(--muted)]">
                Для ребёнка укажите свидетельство о рождении и паспорт законного представителя
                (родителя) в блоке ниже.
              </p>
            )}
            </div>
            {withoutDocuments && (
              <p className="text-xs text-[var(--muted)]">
                Пациента можно сохранить без документов. Для выгрузки в ЕГИСЗ позже понадобится
                заполнить СНИЛС и паспорт.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{UI.phone} {showPhone ? "*" : ""}</Label>
              {!showPhone ? (
                <p className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--muted)]">
                  Телефон скрыт для роли врача
                </p>
              ) : (
                <>
              {fields.isChild && (
                <div className="space-y-1">
                  <select
                    className={selectClass}
                    defaultValue=""
                    onChange={(e) => {
                      const parentId = e.target.value;
                      if (!parentId) return;
                      const parent = patients.find((p) => p.id === parentId);
                      if (!parent) return;
                      setFields((prev) => ({
                        ...prev,
                        phone: parent.phone,
                        representativeFullName:
                          prev.representativeFullName.trim() ||
                          getFullName(parent.firstName, parent.lastName, parent.middleName),
                        representativePassportSeries:
                          prev.representativePassportSeries ||
                          parent.passportSeries ||
                          "",
                        representativePassportNumber:
                          prev.representativePassportNumber ||
                          parent.passportNumber ||
                          "",
                      }));
                      e.target.value = "";
                    }}
                  >
                    <option value="">Телефон родителя из базы…</option>
                    {patients
                      .filter((p) => p.id !== patient?.id && !p.isChild)
                      .sort((a, b) =>
                        `${a.lastName} ${a.firstName}`.localeCompare(
                          `${b.lastName} ${b.firstName}`,
                          "ru"
                        )
                      )
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {getFullName(p.firstName, p.lastName, p.middleName)} · {p.phone}
                        </option>
                      ))}
                  </select>
                  <p className="text-xs text-[var(--muted)]">
                    У ребёнка может не быть своего телефона — укажите номер родителя, даже если
                    он уже есть в другой карточке.
                  </p>
                </div>
              )}
              <PhoneInput value={fields.phone} onChange={(v) => set("phone", v)} required />
              {docErrors.phone && (
                <p className="text-xs text-red-600">{docErrors.phone}</p>
              )}
                </>
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
            <div className="space-y-2 sm:col-span-2">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-[var(--border)]"
                  checked={fields.notifyConsent}
                  onChange={(e) => set("notifyConsent", e.target.checked)}
                />
                <span>
                  Согласие на сервисные SMS/e-mail/Telegram о записи (без мед. данных, 152-ФЗ)
                </span>
              </label>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Telegram chat ID (если пациент привязал бота)</Label>
              <Input
                value={fields.telegramChatId}
                onChange={(e) => set("telegramChatId", e.target.value)}
                placeholder="123456789"
                className="font-mono text-xs"
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

          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[var(--foreground)]">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-[var(--border)] accent-[var(--primary)]"
              checked={fields.isChild}
              onChange={(e) => {
                const checked = e.target.checked;
                set("isChild", checked);
                if (checked) {
                  setFields((prev) => ({
                    ...prev,
                    passportSeries: "",
                    passportNumber: "",
                  }));
                  setDocErrors((prev) => {
                    const next = { ...prev };
                    delete next.passportSeries;
                    delete next.passportNumber;
                    return next;
                  });
                } else {
                  setFields((prev) => ({
                    ...prev,
                    birthCertificateSeries: "",
                    birthCertificateNumber: "",
                    representativeFullName: "",
                    representativeBirthDate: "",
                    representativePassportSeries: "",
                    representativePassportNumber: "",
                  }));
                  setDocErrors((prev) => {
                    const next = { ...prev };
                    delete next.birthCertificateSeries;
                    delete next.birthCertificateNumber;
                    delete next.representativePassportSeries;
                    delete next.representativePassportNumber;
                    return next;
                  });
                }
              }}
            />
            Пациент — ребёнок
          </label>

          {fields.isChild && (
            <div className="form-panel space-y-3 border-teal-200 dark:border-teal-800">
              <p className="form-panel-title">Документы ребёнка и представителя</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Серия свидетельства о рождении *</Label>
                  <Input
                    value={fields.birthCertificateSeries}
                    onChange={(e) => set("birthCertificateSeries", e.target.value)}
                    placeholder="I-АА или IVМЮ"
                    disabled={withoutDocuments}
                  />
                  {docErrors.birthCertificateSeries && (
                    <p className="text-xs text-red-600">{docErrors.birthCertificateSeries}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Номер свидетельства о рождении *</Label>
                  <Input
                    value={fields.birthCertificateNumber}
                    onChange={(e) =>
                      set("birthCertificateNumber", formatBirthCertificateNumber(e.target.value))
                    }
                    placeholder="123456"
                    inputMode="numeric"
                    disabled={withoutDocuments}
                  />
                  {docErrors.birthCertificateNumber && (
                    <p className="text-xs text-red-600">{docErrors.birthCertificateNumber}</p>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label>ФИО законного представителя</Label>
                <Input
                  value={fields.representativeFullName}
                  onChange={(e) => set("representativeFullName", e.target.value)}
                  placeholder="Фамилия Имя Отчество родителя"
                  disabled={withoutDocuments}
                />
              </div>
              <div className="space-y-2">
                <Label>Дата рождения представителя</Label>
                <Input
                  type="date"
                  value={fields.representativeBirthDate}
                  onChange={(e) => set("representativeBirthDate", e.target.value)}
                  disabled={withoutDocuments}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Паспорт представителя, серия *</Label>
                  <Input
                    value={fields.representativePassportSeries}
                    onChange={(e) =>
                      set("representativePassportSeries", formatPassportSeries(e.target.value))
                    }
                    placeholder="4510"
                    inputMode="numeric"
                    maxLength={4}
                    disabled={withoutDocuments}
                  />
                  {docErrors.representativePassportSeries && (
                    <p className="text-xs text-red-600">{docErrors.representativePassportSeries}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Паспорт представителя, номер *</Label>
                  <Input
                    value={fields.representativePassportNumber}
                    onChange={(e) =>
                      set("representativePassportNumber", formatPassportNumber(e.target.value))
                    }
                    placeholder="123456"
                    inputMode="numeric"
                    maxLength={6}
                    disabled={withoutDocuments}
                  />
                  {docErrors.representativePassportNumber && (
                    <p className="text-xs text-red-600">{docErrors.representativePassportNumber}</p>
                  )}
                </div>
              </div>
            </div>
          )}

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

          <div className="form-panel space-y-2">
            {clinicVisitCount > 0 && (
              <p className="rounded-md border border-teal-200 bg-teal-50/80 px-3 py-2 text-sm text-teal-900 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-100">
                В нашей клинике: <strong>{clinicVisitCount}</strong>{" "}
                {clinicVisitCount === 1 ? "приём" : "приёма"}
                {clinicLastVisit ? ` · последний визит ${formatDate(clinicLastVisit)}` : ""}.
                Статусы приёмов обновляют карточку автоматически.
              </p>
            )}
            <label className="flex items-center gap-2 text-sm font-medium text-[var(--foreground)]">
              <input
                type="checkbox"
                checked={fields.hadPreviousVisits}
                onChange={(e) => set("hadPreviousVisits", e.target.checked)}
                className="h-4 w-4 rounded border-[var(--border)] accent-[var(--primary)]"
              />
              Был на приёме в другой клинике (до нас)
            </label>
            {fields.hadPreviousVisits && (
              <textarea
                className="mt-2 min-h-[72px] w-full rounded-lg border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)]"
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
                onChange={(e) => {
                  const next = e.target.value as PatientStatus;
                  set("status", next);
                  if (next === "debtor" && !debtAmount) {
                    const existing = patient ? getPatientDebtAmount(patient.balance) : 0;
                    if (existing > 0) setDebtAmount(String(existing));
                  }
                }}
              >
                {Object.entries(PATIENT_STATUS_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {fields.status === "debtor" && (
            <div className="form-panel space-y-2">
              <Label htmlFor="patient-modal-debt">Сумма долга, ₽</Label>
              <Input
                id="patient-modal-debt"
                type="number"
                min={0}
                step={100}
                inputMode="numeric"
                placeholder="Например, 5000"
                value={debtAmount}
                onChange={(e) => setDebtAmount(e.target.value)}
              />
              <p className="text-xs text-[var(--muted)]">
                Отобразится в балансе как отрицательная сумма. Оставьте 0 и сохраните, чтобы
                погасить долг (статус станет «Активный»).
              </p>
              {patient && getPatientDebtAmount(patient.balance) > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDebtAmount("0")}
                >
                  Погасить долг
                </Button>
              )}
            </div>
          )}

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
            <Button onClick={handleSave} disabled={saving}>
              {saving
                ? "Сохранение…"
                : appointmentFields.enabled
                  ? "Сохранить и записать"
                  : UI.save}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog
      open={duplicateMatch !== null}
      onOpenChange={(next) => {
        if (!next) setDuplicateMatch(null);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Такой пациент уже есть</DialogTitle>
        </DialogHeader>
        {duplicateMatch && (
          <div className="space-y-4 text-sm text-slate-600">
            <p>
              В базе уже есть карточка{" "}
              <strong className="text-slate-900">{duplicateName}</strong> (
              {PATIENT_DUPLICATE_REASON_LABELS[duplicateMatch.reason]}).
            </p>
            <p>Новую запись с теми же данными создавать не нужно — откройте существующую карточку.</p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setDuplicateMatch(null)}>
                Изменить данные
              </Button>
              <Button type="button" onClick={goToDuplicateCard}>
                Перейти к карточке
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}
