"use client";

import { use } from "react";
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

  if (!patient) {
    notFound();
  }

  return <PatientDetailView patient={patient} />;
}
