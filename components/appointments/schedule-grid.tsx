"use client";

import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { cn, getFullName } from "@/lib/utils";
import {
  generateTimeSlots,
  isAppointmentOnCalendarDay,
  isSlotFree,
  appointmentBlocksSlot,
  SCHEDULE_DAY_START,
  SCHEDULE_DAY_END,
} from "@/lib/appointment-utils";
import {
  getScheduleAppointmentCellClass,
  getScheduleAppointmentStatusLabel,
  resolveAppointmentWorkAct,
} from "@/lib/appointment-schedule-display";
import { getDoctorHoursForDate } from "@/lib/clinic-schedule";
import type { Appointment, Doctor, DoctorMonthSchedule, Patient, Payment, WorkAct } from "@/lib/types";

interface ScheduleGridProps {
  days: Date[];
  doctors: Doctor[];
  appointments: Appointment[];
  patients: Patient[];
  workActs?: WorkAct[];
  payments?: Payment[];
  doctorSchedules?: DoctorMonthSchedule[];
  onSlotClick: (date: string, time: string, doctorId: string) => void;
  onAppointmentClick: (apt: Appointment) => void;
  onActClick?: (actId: string) => void;
}

export function ScheduleGrid({
  days,
  doctors,
  appointments,
  patients,
  workActs = [],
  payments = [],
  doctorSchedules = [],
  onSlotClick,
  onAppointmentClick,
  onActClick,
}: ScheduleGridProps) {
  const slots = generateTimeSlots();
  const cols = doctors.length > 0 ? doctors : [{ id: "_none", name: "Без врача" } as Doctor];
  const isDayView = days.length === 1;

  const timeHeaderClass = cn(
    "sticky left-0 z-10 border-b-2 border-r-2 py-2 text-sm font-semibold",
    isDayView ? "w-[52px] max-w-[52px] px-1 text-center" : "min-w-[64px] px-2 text-left"
  );

  const timeCellClass = cn(
    "sticky left-0 z-10 border-b border-r-2 py-2 text-sm font-semibold",
    isDayView ? "w-[52px] max-w-[52px] px-1 text-center" : "min-w-[64px] px-2"
  );

  return (
    <div
      className="overflow-x-auto rounded-lg border-2 shadow-sm"
      style={{
        borderColor: "var(--schedule-border)",
        backgroundColor: "var(--schedule-grid-bg)",
      }}
    >
      <table
        className={cn(
          "w-full border-collapse text-sm",
          isDayView ? "table-fixed" : "min-w-[960px]"
        )}
      >
        <thead>
          <tr style={{ backgroundColor: "var(--schedule-header-bg)" }}>
            <th
              className={timeHeaderClass}
              style={{
                borderColor: "var(--schedule-border)",
                backgroundColor: "var(--schedule-header-bg)",
                color: "var(--schedule-header-text)",
              }}
            >
              Время
              <div
                className="text-[10px] font-medium leading-tight"
                style={{ color: "var(--schedule-muted)" }}
              >
                {SCHEDULE_DAY_START}–{SCHEDULE_DAY_END}
              </div>
            </th>
            {days.map((day) => {
              const dateStr = format(day, "yyyy-MM-dd");
              return cols.map((doc) => {
                const hours =
                  doc.id !== "_none"
                    ? getDoctorHoursForDate(doc.id, dateStr, doctorSchedules)
                    : null;
                return (
                  <th
                    key={`${day.toISOString()}-${doc.id}`}
                    className={cn(
                      "border-b-2 border-r px-2 py-3 text-center last:border-r-0",
                      isDayView ? "min-w-[120px] sm:min-w-[140px]" : "min-w-[140px]"
                    )}
                    style={{
                      borderColor: "var(--schedule-border)",
                      backgroundColor: "var(--schedule-header-bg)",
                    }}
                  >
                    <div
                      className="text-sm font-semibold"
                      style={{ color: "var(--schedule-header-text)" }}
                    >
                      {format(day, "EEE d MMM", { locale: ru })}
                    </div>
                    <div
                      className="mt-0.5 text-sm font-semibold"
                      style={{ color: "var(--schedule-doctor-name)" }}
                    >
                      {doc.name}
                    </div>
                    {hours && (
                      <div
                        className="text-xs font-medium"
                        style={{ color: "var(--schedule-muted)" }}
                      >
                        {hours.startTime}–{hours.endTime}
                      </div>
                    )}
                    {doc.specialization && (
                      <div
                        className="text-xs font-normal"
                        style={{ color: "var(--schedule-muted)" }}
                      >
                        {doc.specialization}
                      </div>
                    )}
                  </th>
                );
              });
            })}
          </tr>
        </thead>
        <tbody>
          {slots.map((slot) => (
            <tr
              key={slot}
              className="hover:opacity-95"
              style={{ backgroundColor: "var(--schedule-cell-bg)" }}
            >
              <td
                className={timeCellClass}
                style={{
                  borderColor: "var(--schedule-border)",
                  backgroundColor: "var(--schedule-time-bg)",
                  color: "var(--schedule-header-text)",
                }}
              >
                {slot}
              </td>
              {days.map((day) => {
                const dateStr = format(day, "yyyy-MM-dd");
                return cols.map((doc) => {
                  const docId = doc.id === "_none" ? undefined : doc.id;
                  const apt = appointments.find(
                    (a) =>
                      isAppointmentOnCalendarDay(a, day) &&
                      (docId ? a.doctorId === docId : !a.doctorId) &&
                      appointmentBlocksSlot(a, dateStr, slot, docId)
                  );
                  const free =
                    docId &&
                    isSlotFree(appointments, dateStr, slot, docId, apt?.id);

                  if (apt) {
                    const patient = patients.find((p) => p.id === apt.patientId);
                    const patientName = patient
                      ? getFullName(
                          patient.firstName,
                          patient.lastName,
                          patient.middleName
                        )
                      : "Карточка не найдена";
                    const linkedAct = resolveAppointmentWorkAct(apt, workActs);
                    const statusLabel = getScheduleAppointmentStatusLabel(
                      apt,
                      linkedAct,
                      payments
                    );
                    const cellTitle = [
                      `${apt.startTime}–${apt.endTime}`,
                      apt.complaints ?? apt.reason,
                      linkedAct ? `Акт № ${linkedAct.actNumber}` : undefined,
                      statusLabel,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <td
                        key={`${dateStr}-${doc.id}-${slot}`}
                        className="border-b border-r p-1 align-top"
                        style={{
                          borderColor: "var(--schedule-border)",
                          backgroundColor: "var(--schedule-cell-bg)",
                        }}
                      >
                        <div
                          className={cn(
                            "min-h-[52px] w-full rounded-md px-2 py-1.5 text-left text-sm leading-snug",
                            getScheduleAppointmentCellClass(apt, linkedAct, payments)
                          )}
                          title={cellTitle}
                        >
                          <button
                            type="button"
                            className="w-full text-left"
                            onClick={() => onAppointmentClick(apt)}
                          >
                            <span className="block text-xs font-medium opacity-90">
                              {apt.startTime}–{apt.endTime}
                            </span>
                            <span className="block truncate font-semibold">{patientName}</span>
                            <span className="block truncate text-xs opacity-85">{statusLabel}</span>
                          </button>
                          {linkedAct && (
                            <button
                              type="button"
                              className="mt-0.5 block w-full truncate text-left text-xs font-semibold text-emerald-800 underline decoration-emerald-600/60 underline-offset-2 hover:text-emerald-950"
                              onClick={() => onActClick?.(linkedAct.id)}
                            >
                              Акт № {linkedAct.actNumber}
                            </button>
                          )}
                        </div>
                      </td>
                    );
                  }

                  return (
                    <td
                      key={`${dateStr}-${doc.id}-${slot}`}
                      className="border-b border-r p-1"
                      style={{
                        borderColor: "var(--schedule-border)",
                        backgroundColor: "var(--schedule-cell-bg)",
                      }}
                    >
                      {docId && free ? (
                        <button
                          type="button"
                          onClick={() => onSlotClick(dateStr, slot, docId)}
                          className="flex h-[52px] w-full items-center justify-center rounded border border-dashed text-lg transition-colors hover:border-teal-500 hover:bg-teal-500/10 hover:text-teal-600"
                          style={{
                            borderColor: "var(--schedule-border)",
                            color: "var(--schedule-muted)",
                          }}
                        >
                          +
                        </button>
                      ) : (
                        <div className="h-[52px]" />
                      )}
                    </td>
                  );
                });
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
