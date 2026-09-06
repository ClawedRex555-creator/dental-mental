"use client";

import type { Appointment, Doctor, MedicalRecord, Patient, WorkAct } from "@/lib/types";
import { PAYMENT_STATUS_LABELS } from "@/lib/constants";
import { AppointmentStatusBadge } from "@/components/shared/status-badge";
import { formatCurrency, formatDate, getFullName } from "@/lib/utils";
import { formatWorkActItemWithTooth, getWorkActCustomerName } from "@/lib/work-act-utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

interface PatientVisitDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: Appointment | null;
  patient: Patient;
  doctor?: Doctor;
  workAct?: WorkAct;
  medicalRecord?: MedicalRecord;
  onOpenAct?: (actId: string) => void;
  onPrintAct?: (act: WorkAct) => void;
}

export function PatientVisitDetailDialog({
  open,
  onOpenChange,
  appointment,
  patient,
  doctor,
  workAct,
  medicalRecord,
  onOpenAct,
  onPrintAct,
}: PatientVisitDetailDialogProps) {
  if (!appointment) return null;

  const isOther = appointment.isOtherClinicVisit;
  const childName = getFullName(patient.firstName, patient.lastName, patient.middleName);
  const customerName = getWorkActCustomerName(patient);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isOther ? "Визит в другой клинике" : `Визит ${formatDate(appointment.date)}`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {!isOther && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-600">
                {appointment.startTime}
                {appointment.endTime ? ` – ${appointment.endTime}` : ""}
              </span>
              <AppointmentStatusBadge status={appointment.status} />
            </div>
          )}

          {doctor && !isOther && (
            <p>
              <span className="text-slate-500">Врач:</span> {doctor.name}
            </p>
          )}

          {patient.isChild && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p>
                <span className="text-slate-500">Пациент (ребёнок):</span> {childName}
              </p>
              <p className="mt-1">
                <span className="text-slate-500">Заказчик:</span> {customerName}
              </p>
            </div>
          )}

          <div>
            <p className="font-medium text-slate-800">Жалобы / причина визита</p>
            <p className="mt-1 text-slate-700">
              {appointment.complaints?.trim() ||
                appointment.reason?.trim() ||
                (isOther ? "Без описания" : "—")}
            </p>
            {isOther && appointment.reason?.trim() && (
              <p className="mt-2 text-xs text-amber-800">{appointment.reason}</p>
            )}
          </div>

          {workAct ? (
            <div className="space-y-3 rounded-lg border border-teal-100 bg-teal-50/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-slate-900">
                  Акт № {workAct.actNumber} от {formatDate(workAct.actDate)}
                </p>
                <Badge variant={workAct.paymentStatus === "paid" ? "success" : "warning"}>
                  {PAYMENT_STATUS_LABELS[workAct.paymentStatus ?? "pending"]}
                </Badge>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Оказанные услуги
                </p>
                <ul className="mt-2 space-y-1.5">
                  {workAct.items.map((item) => (
                    <li key={item.id} className="flex justify-between gap-3">
                      <span>{formatWorkActItemWithTooth(item)}</span>
                      <span className="shrink-0 tabular-nums text-slate-700">
                        {formatCurrency(item.total)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-right font-medium text-teal-800">
                  Итого: {formatCurrency(workAct.totalAmount)}
                </p>
              </div>

              {workAct.notes?.trim() && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Примечание к акту
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-slate-800">{workAct.notes}</p>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                {onOpenAct && (
                  <Button size="sm" variant="outline" onClick={() => onOpenAct(workAct.id)}>
                    Открыть акт
                  </Button>
                )}
                {onPrintAct && (
                  <Button size="sm" variant="secondary" onClick={() => onPrintAct(workAct)}>
                    Печать акта
                  </Button>
                )}
              </div>
            </div>
          ) : medicalRecord ? (
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="font-medium text-slate-900">Запись медкарты</p>
              {medicalRecord.treatment && (
                <p>
                  <span className="text-slate-500">Лечение:</span> {medicalRecord.treatment}
                </p>
              )}
              {medicalRecord.recommendations && (
                <p>
                  <span className="text-slate-500">Рекомендации:</span>{" "}
                  {medicalRecord.recommendations}
                </p>
              )}
            </div>
          ) : (
            !isOther && (
              <p className="text-slate-500">
                По этому визиту акт оказанных услуг ещё не оформлен.
              </p>
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
