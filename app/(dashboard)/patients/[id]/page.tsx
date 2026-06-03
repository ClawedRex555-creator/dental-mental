"use client";

import { use, useEffect, useState } from "react";
import { notFound } from "next/navigation";
import { PatientDetailView } from "@/components/patients/patient-detail-view";
import { useClinicStore } from "@/store/useClinicStore";

export default function PatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const patient = useClinicStore((s) => s.patients.find((p) => p.id === id));
  const [dataSettled, setDataSettled] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDataSettled(true), 800);
    return () => clearTimeout(t);
  }, [id]);

  if (!patient) {
    if (!dataSettled) {
      return (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-[var(--muted)]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
          <p className="text-sm">Загрузка карточки пациента…</p>
        </div>
      );
    }
    notFound();
  }

  return <PatientDetailView patient={patient} />;
}
