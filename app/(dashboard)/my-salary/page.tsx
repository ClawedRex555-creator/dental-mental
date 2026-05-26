"use client";

import { MyDoctorSalary } from "@/components/finance/my-doctor-salary";
import { useClinicStore } from "@/store/useClinicStore";

export default function MySalaryPage() {
  const role = useClinicStore((s) => s.currentUser.role);

  if (role !== "doctor") {
    return (
      <p className="text-sm text-[var(--muted)]">
        Этот раздел доступен только врачам.
      </p>
    );
  }

  return <MyDoctorSalary />;
}
