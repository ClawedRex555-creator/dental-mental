"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardList, Plus, Search } from "lucide-react";
import { MedicalRecordModal } from "@/components/medical-records/medical-record-modal";
import { TreatmentPlanModal } from "@/components/treatment-plans/treatment-plan-modal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { UI } from "@/lib/constants";
import { formatDate, getFullName } from "@/lib/utils";
import { useClinicStore } from "@/store/useClinicStore";

export default function MedicalRecordsPage() {
  const { medicalRecords, patients, doctors } = useClinicStore();
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [planRecordId, setPlanRecordId] = useState<string | undefined>();
  const [planPatientId, setPlanPatientId] = useState<string | undefined>();

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return medicalRecords.filter((r) => {
      const patient = patients.find((p) => p.id === r.patientId);
      const name = patient
        ? getFullName(patient.firstName, patient.lastName, patient.middleName).toLowerCase()
        : "";
      return (
        name.includes(q) ||
        r.diagnosis.toLowerCase().includes(q) ||
        r.treatment.toLowerCase().includes(q)
      );
    });
  }, [medicalRecords, patients, search]);

  const openPlanFromRecord = (recordId: string, patientId: string) => {
    setPlanRecordId(recordId);
    setPlanPatientId(patientId);
    setPlanModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Медкарты</h1>
          <p className="text-sm text-slate-500">История визитов и протоколы лечения</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" />
          Новая запись
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          className="pl-9"
          placeholder={UI.searchRecords}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="space-y-4">
        {filtered.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-slate-500">
              Записей пока нет. Добавьте пациента, врача и создайте первую запись в медкарту.
            </CardContent>
          </Card>
        )}
        {filtered.map((record) => {
          const patient = patients.find((p) => p.id === record.patientId);
          const doctor = doctors.find((d) => d.id === record.doctorId);
          return (
            <Card key={record.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <CardTitle className="text-base">{record.diagnosis}</CardTitle>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-500">{formatDate(record.createdAt)}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openPlanFromRecord(record.id, record.patientId)}
                    >
                      <ClipboardList className="mr-1 h-4 w-4" />
                      План лечения
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-slate-500">
                  {patient ? (
                    <Link href={`/patients/${patient.id}`} className="text-teal-700 hover:underline">
                      {getFullName(patient.firstName, patient.lastName, patient.middleName)}
                    </Link>
                  ) : (
                    "-"
                  )}{" "}
                  · {doctor?.name} · {record.serviceName}
                </p>
              </CardHeader>
              <CardContent className="text-sm text-slate-600">
                <p className="font-medium text-slate-700">{UI.complaints}</p>
                <p>{record.complaints}</p>
                <p className="mt-2 font-medium text-slate-700">{UI.treatment}</p>
                <p>{record.treatment}</p>
                {record.recommendations && (
                  <>
                    <p className="mt-2 font-medium text-slate-700">{UI.recommendations}</p>
                    <p>{record.recommendations}</p>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <MedicalRecordModal open={modalOpen} onOpenChange={setModalOpen} />
      <TreatmentPlanModal
        open={planModalOpen}
        onOpenChange={setPlanModalOpen}
        defaultPatientId={planPatientId}
        defaultMedicalRecordId={planRecordId}
      />
    </div>
  );
}
