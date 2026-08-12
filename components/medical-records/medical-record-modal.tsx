"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import type { MedicalRecord } from "@/lib/types";
import {
  DENTAL_COMPLAINTS,
  DENTAL_DIAGNOSES,
  DENTAL_SERVICE_NAMES,
  DENTAL_TREATMENTS,
  DENTAL_RECOMMENDATIONS,
} from "@/lib/catalogs";
import { UI } from "@/lib/constants";
import { extractDiagnosisCode } from "@/lib/egisz/cda/diagnosis-code";
import { SearchAutocomplete } from "@/components/shared/search-autocomplete";
import { PatientSearchSelect } from "@/components/shared/patient-search-select";
import { PatientModal } from "@/components/patients/patient-modal";
import { upsertMedicalRecordViaCommandApi } from "@/lib/clinic-entity.client";
import {
  markClinicSyncedAfterCommand,
  notifyClinicDataChanged,
} from "@/lib/clinic-data-sync.client";
import {
  beginClinicCommandMutation,
  endClinicCommandMutation,
  runWithoutClinicFlush,
  useClinicStore,
} from "@/store/useClinicStore";
import { generateId } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface MedicalRecordModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultPatientId?: string;
  onSaved?: (recordId: string) => void;
}

function resetForm(defaultPatientId: string | undefined) {
  return {
    patientId: defaultPatientId ?? "",
    doctorId: "",
    serviceName: "",
    complaints: "",
    diagnosis: "",
    treatment: "",
    recommendations: "",
  };
}

export function MedicalRecordModal({
  open,
  onOpenChange,
  defaultPatientId,
  onSaved,
}: MedicalRecordModalProps) {
  const { patients, doctors, addMedicalRecord } = useClinicStore();
  const activeDoctors = doctors.filter((d) => d.role === "doctor");
  const wasOpen = useRef(false);

  const [patientId, setPatientId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [complaints, setComplaints] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [treatment, setTreatment] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [patientModalOpen, setPatientModalOpen] = useState(false);

  useEffect(() => {
    if (open && !wasOpen.current) {
      const f = resetForm(defaultPatientId);
      setPatientId(f.patientId);
      setDoctorId(f.doctorId);
      setServiceName(f.serviceName);
      setComplaints(f.complaints);
      setDiagnosis(f.diagnosis);
      setTreatment(f.treatment);
      setRecommendations(f.recommendations);
    }
    wasOpen.current = open;
  }, [open, defaultPatientId]);

  const handleSave = () => {
    if (!patientId || !doctorId || !complaints.trim() || !diagnosis.trim() || !treatment.trim()) {
      toast.error("Заполните пациента, врача, жалобы, диагноз и лечение");
      return;
    }

    const diagnosisParsed = extractDiagnosisCode(diagnosis.trim());
    const record: MedicalRecord = {
      id: generateId("mr"),
      patientId,
      doctorId,
      complaints: complaints.trim(),
      anamnesis: complaints.trim(),
      lifeAnamnesis: "Не отягощён",
      objective: treatment.trim(),
      diagnosis: diagnosisParsed.displayName,
      diagnosisCode: diagnosisParsed.code,
      treatment: treatment.trim(),
      recommendations: recommendations.trim() || undefined,
      createdAt: format(new Date(), "yyyy-MM-dd"),
      serviceName: serviceName.trim() || "Приём",
    };

    beginClinicCommandMutation();
    void (async () => {
      try {
        const api = await upsertMedicalRecordViaCommandApi(record);
        if (!api.ok) {
          toast.error(api.error ?? "Не удалось сохранить медзапись на сервере");
          return;
        }
        runWithoutClinicFlush(() => addMedicalRecord(record));
        markClinicSyncedAfterCommand(api.updatedAt, api.revision);
        useClinicStore.getState().pauseClinicAutoSave(15_000);
        notifyClinicDataChanged();
        toast.success("Запись в медкарту добавлена");
        onSaved?.(record.id);
        onOpenChange(false);
      } finally {
        endClinicCommandMutation();
      }
    })();
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Новая запись в медкарту</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{UI.patient}</Label>
            <div className="flex gap-2">
              <PatientSearchSelect
                patients={patients}
                selectedPatientId={patientId}
                placeholder="ФИО или телефон..."
                onSelect={(patient) => setPatientId(patient.id)}
              />
              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                onClick={() => setPatientModalOpen(true)}
              >
                +
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>
              {UI.doctor} <span className="text-red-600">*</span>
            </Label>
            <select
              className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
            >
              <option value="">Выберите врача</option>
              {activeDoctors.length === 0 ? (
                <option value="" disabled>
                  Нет врачей
                </option>
              ) : (
                activeDoctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))
              )}
            </select>
          </div>

          <SearchAutocomplete
            label="Услуга"
            value={serviceName}
            onChange={setServiceName}
            catalog={DENTAL_SERVICE_NAMES}
            placeholder="гигиена, пломба, имплант..."
          />

          <SearchAutocomplete
            label={UI.complaints}
            value={complaints}
            onChange={setComplaints}
            catalog={DENTAL_COMPLAINTS}
            placeholder="боль, кровоточивость..."
            multiline
            required
          />

          <SearchAutocomplete
            label="Диагноз"
            value={diagnosis}
            onChange={setDiagnosis}
            catalog={DENTAL_DIAGNOSES}
            placeholder="кариес, пульпит, гингивит..."
            required
          />

          <SearchAutocomplete
            label={UI.treatment}
            value={treatment}
            onChange={setTreatment}
            catalog={DENTAL_TREATMENTS}
            placeholder="пломба, каналы, удаление..."
            multiline
            required
          />

          <SearchAutocomplete
            label={UI.recommendations}
            value={recommendations}
            onChange={setRecommendations}
            catalog={DENTAL_RECOMMENDATIONS}
            placeholder="рекомендации по уходу..."
            multiline
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {UI.cancel}
            </Button>
            <Button onClick={handleSave} disabled={!activeDoctors.length}>
              {UI.save}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    <PatientModal
      open={patientModalOpen}
      onOpenChange={setPatientModalOpen}
      onCreated={(patient) => setPatientId(patient.id)}
    />
    </>
  );
}
