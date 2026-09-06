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
  const syncPhase = useClinicStore((s) => s.clinicSyncPhase);
  const [waitTimedOut, setWaitTimedOut] = useState(false);

  useEffect(() => {
    setWaitTimedOut(false);
    const t = setTimeout(() => setWaitTimedOut(true), 12_000);
    return () => clearTimeout(t);
  }, [id]);

  // После hard-навигации с расписания store может ещё подтягивать snapshot —
  // не отдаём 404, пока идёт loading или короткое окно после ready.
  const [readyGraceDone, setReadyGraceDone] = useState(false);
  useEffect(() => {
    if (patient) {
      setReadyGraceDone(false);
      return;
    }
    if (syncPhase === "loading") {
      setReadyGraceDone(false);
      return;
    }
    const t = setTimeout(() => setReadyGraceDone(true), 2_000);
    return () => clearTimeout(t);
  }, [patient, syncPhase, id]);

  if (!patient) {
    const stillWaiting =
      !waitTimedOut && (syncPhase === "loading" || !readyGraceDone);
    if (stillWaiting) {
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
