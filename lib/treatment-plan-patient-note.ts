import { TREATMENT_PLAN_STATUS_LABELS } from "@/lib/constants";
import type { PatientNote, TreatmentPlan, UserRole } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

/** Стабильный id заметки, привязанной к плану лечения */
export function treatmentPlanNoteId(planId: string): string {
  return `pn_tp_${planId}`;
}

export function findTreatmentPlanNote(
  notes: PatientNote[],
  planId: string
): PatientNote | undefined {
  return notes.find(
    (n) => n.sourceTreatmentPlanId === planId || n.id === treatmentPlanNoteId(planId)
  );
}

/** Текст заметки: контекст плана + комментарий */
export function buildTreatmentPlanNoteText(
  plan: TreatmentPlan,
  doctorName: string,
  comment: string
): string {
  const status = TREATMENT_PLAN_STATUS_LABELS[plan.status];
  const preview = plan.items
    .slice(0, 4)
    .map((i) => `${i.toothNumber ? `#${i.toothNumber} ` : ""}${i.serviceName}`)
    .join("; ");
  const servicesLine =
    plan.items.length === 0
      ? ""
      : plan.items.length > 4
        ? `Услуги: ${preview}… (+${plan.items.length - 4})`
        : `Услуги: ${preview}`;

  const parts = [
    `План лечения: «${plan.title}»`,
    `Статус: ${status} · ${formatCurrency(plan.finalAmount)} · позиций: ${plan.items.length}`,
    `Врач: ${doctorName || "—"}`,
  ];
  if (servicesLine) parts.push(servicesLine);
  parts.push("", "Комментарий к плану:", comment.trim());
  return parts.join("\n");
}

export function syncTreatmentPlanCommentToPatientNotes(input: {
  plan: TreatmentPlan;
  comment: string;
  doctorName: string;
  patientNotes: PatientNote[];
  currentUser: { id: string; name: string; role: UserRole };
  addPatientNote: (note: PatientNote) => void;
  updatePatientNote: (id: string, data: Partial<PatientNote>) => void;
  deletePatientNote: (id: string) => void;
}): void {
  const {
    plan,
    comment,
    doctorName,
    patientNotes,
    currentUser,
    addPatientNote,
    updatePatientNote,
    deletePatientNote,
  } = input;
  const trimmed = comment.trim();
  const existing = findTreatmentPlanNote(patientNotes, plan.id);
  const noteId = existing?.id ?? treatmentPlanNoteId(plan.id);

  if (!trimmed) {
    if (existing) deletePatientNote(existing.id);
    return;
  }

  const text = buildTreatmentPlanNoteText(plan, doctorName, trimmed);
  const now = new Date().toISOString();

  if (existing) {
    updatePatientNote(existing.id, {
      text,
      author: currentUser.name || existing.author,
      authorId: currentUser.id,
      role: currentUser.role,
      category: "clinical",
      sourceTreatmentPlanId: plan.id,
    });
    return;
  }

  addPatientNote({
    id: noteId,
    patientId: plan.patientId,
    author: currentUser.name || "Сотрудник",
    authorId: currentUser.id,
    role: currentUser.role,
    text,
    category: "clinical",
    sourceTreatmentPlanId: plan.id,
    createdAt: now,
  });
}
