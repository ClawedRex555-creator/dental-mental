import type { AppointmentStatus, PatientStatus, TreatmentPlanStatus } from "@/lib/types";
import {
  APPOINTMENT_STATUS_COLORS,
  APPOINTMENT_STATUS_LABELS,
  PATIENT_STATUS_LABELS,
  TREATMENT_PLAN_STATUS_LABELS,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

const PATIENT_COLORS: Record<PatientStatus, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  new: "bg-sky-50 text-sky-700 border-sky-200",
  archived: "bg-slate-100 text-slate-600 border-slate-200",
  debtor: "bg-red-50 text-red-700 border-red-200",
  vip: "bg-amber-50 text-amber-800 border-amber-200",
};

const PLAN_COLORS: Record<TreatmentPlanStatus, string> = {
  draft: "bg-slate-100 text-slate-600",
  proposed: "bg-sky-50 text-sky-700",
  accepted: "bg-emerald-50 text-emerald-700",
  in_progress: "bg-violet-50 text-violet-700",
  completed: "bg-teal-50 text-teal-800",
  cancelled: "bg-red-50 text-red-700",
};

export function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  return (
    <span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium", APPOINTMENT_STATUS_COLORS[status])}>
      {APPOINTMENT_STATUS_LABELS[status]}
    </span>
  );
}

export function PatientStatusBadge({ status }: { status: PatientStatus }) {
  return (
    <span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium", PATIENT_COLORS[status])}>
      {PATIENT_STATUS_LABELS[status]}
    </span>
  );
}

export function TreatmentPlanStatusBadge({ status }: { status: TreatmentPlanStatus }) {
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", PLAN_COLORS[status])}>
      {TREATMENT_PLAN_STATUS_LABELS[status]}
    </span>
  );
}
