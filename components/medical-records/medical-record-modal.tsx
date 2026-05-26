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
import { SearchAutocomplete } from "@/components/shared/search-autocomplete";
import { useClinicStore } from "@/store/useClinicStore";
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

function resetForm(
  defaultPatientId: string | undefined,
  patients: { id: string }[],
  activeDoctors: { id: string }[],
  services: { name: string }[]
) {
  return {
    patientId: defaultPatientId ?? patients[0]?.id ?? "",
    doctorId: activeDoctors[0]?.id ?? "",
    serviceName: services[0]?.name ?? "",
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
  const { patients, doctors, services, addMedicalRecord } = useClinicStore();
  const activeDoctors = doctors.filter((d) => d.role === "doctor");
  const wasOpen = useRef(false);

  const [patientId, setPatientId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [complaints, setComplaints] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [treatment, setTreatment] = useState("");
  const [recommendations, setRecommendations] = useState("");

  useEffect(() => {
    if (open && !wasOpen.current) {
      const f = resetForm(defaultPatientId, patients, activeDoctors, services);
      setPatientId(f.patientId);
      setDoctorId(f.doctorId);
      setServiceName(f.serviceName);
      setComplaints(f.complaints);
      setDiagnosis(f.diagnosis);
      setTreatment(f.treatment);
      setRecommendations(f.recommendations);
    }
    wasOpen.current = open;
  }, [open, defaultPatientId, patients, activeDoctors, services]);

  const handleSave = () => {
    if (!patientId || !doctorId || !complaints.trim() || !diagnosis.trim() || !treatment.trim()) {
      toast.error("Заполните пациента, врача, жалобы, диагноз и лечение");
      return;
    }

    const record: MedicalRecord = {
      id: generateId("mr"),
      patientId,
      doctorId,
      complaints: complaints.trim(),
      diagnosis: diagnosis.trim(),
      treatment: treatment.trim(),
      recommendations: recommendations.trim() || undefined,
      createdAt: format(new Date(), "yyyy-MM-dd"),
      serviceName: serviceName.trim() || "Приём",
    };

    addMedicalRecord(record);
    toast.success("Запись в медкарту добавлена");
    onSaved?.(record.id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Новая запись в медкарту</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{UI.patient}</Label>
              <select
                className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
              >
                {patients.length === 0 ? (
                  <option value="">Нет пациентов</option>
                ) : (
                  patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.lastName} {p.firstName}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div className="space-y-2">
              <Label>{UI.doctor}</Label>
              <select
                className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                value={doctorId}
                onChange={(e) => setDoctorId(e.target.value)}
              >
                {activeDoctors.length === 0 ? (
                  <option value="">Нет врачей</option>
                ) : (
                  activeDoctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))
                )}
              </select>
            </div>
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
            <Button onClick={handleSave} disabled={!patients.length || !activeDoctors.length}>
              {UI.save}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
