"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import { ru } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { AppointmentModal } from "@/components/appointments/appointment-modal";
import { ScheduleGrid } from "@/components/appointments/schedule-grid";
import { WorkActModal } from "@/components/finance/work-act-modal";
import {
  getScheduleAppointmentCellClass,
  getScheduleAppointmentStatusLabel,
  resolveAppointmentWorkAct,
} from "@/lib/appointment-schedule-display";
import {
  filterAppointmentsForAssistant,
  getDoctorsFromAssistantAppointments,
  resolveAssistantRecord,
} from "@/lib/assistant-utils";
import { getDoctorsInCabinet } from "@/lib/cabinet-utils";
import { isDoctorWorkingOnDate, needsScheduleReminder, formatScheduleMonthLabel } from "@/lib/clinic-schedule";
import {
  isAppointmentActive,
  isAppointmentInDateRange,
  isAppointmentOnCalendarDay,
  normalizeAppointmentDate,
  SCHEDULE_DAY_END,
  SCHEDULE_DAY_START,
} from "@/lib/appointment-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  UI,
  VIEW_MODE_LABELS,
  WEEKDAY_SHORT,
} from "@/lib/constants";
import { cn, getFullName } from "@/lib/utils";
import { useClinicStore } from "@/store/useClinicStore";
import type { Appointment } from "@/lib/types";

type ViewMode = "day" | "week" | "month";

export default function AppointmentsPage() {
  const { appointments, patients, doctors, cabinets, doctorSchedules, workActs, payments, currentUser, repairPaidActAppointments } =
    useClinicStore();
  const isAssistant = currentUser.role === "assistant";
  const assistantProfile = useMemo(
    () => (isAssistant ? resolveAssistantRecord(currentUser, doctors) : undefined),
    [isAssistant, currentUser, doctors]
  );
  const allDoctors = doctors.filter((d) => d.role === "doctor");
  const assistantAppointments = useMemo(() => {
    if (!isAssistant || !assistantProfile) return [];
    return filterAppointmentsForAssistant(appointments, assistantProfile.id);
  }, [isAssistant, assistantProfile, appointments]);

  const [view, setView] = useState<ViewMode>("day");
  const [isMobile, setIsMobile] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [doctorFilter, setDoctorFilter] = useState<string>("all");
  const [cabinetFilter, setCabinetFilter] = useState<string>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewActId, setViewActId] = useState<string | null>(null);
  const [newSlotDate, setNewSlotDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [newSlotTime, setNewSlotTime] = useState<string>();
  const [newSlotDoctorId, setNewSlotDoctorId] = useState<string>();

  useEffect(() => {
    repairPaidActAppointments();
  }, [repairPaidActAppointments]);

  const effectiveView: ViewMode = isMobile ? "day" : view;

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const selected = useMemo(
    () => (selectedId ? appointments.find((a) => a.id === selectedId) ?? null : null),
    [appointments, selectedId]
  );

  const scheduleDate =
    effectiveView === "day" ? format(currentDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");

  const scheduleReminder = useMemo(
    () => needsScheduleReminder(doctorSchedules, allDoctors.map((d) => d.id)),
    [doctorSchedules, allDoctors]
  );

  const filtered = useMemo(() => {
    const base = isAssistant ? assistantAppointments : appointments;
    return base.filter((a) => {
      if (a.isOtherClinicVisit) return false;
      if (!isAssistant && doctorFilter !== "all") {
        return a.doctorId === doctorFilter;
      }
      if (!isAssistant && cabinetFilter !== "all") {
        if (!a.doctorId) return a.cabinetId === cabinetFilter;
        const inCabinet = getDoctorsInCabinet(cabinetFilter, doctors, cabinets);
        return a.doctorId ? inCabinet.some((d) => d.id === a.doctorId) : false;
      }
      return true;
    });
  }, [
    appointments,
    assistantAppointments,
    isAssistant,
    doctorFilter,
    cabinetFilter,
    doctors,
    cabinets,
  ]);

  const rangeStart =
    effectiveView === "day"
      ? currentDate
      : effectiveView === "week"
        ? startOfWeek(currentDate, { weekStartsOn: 1 })
        : startOfMonth(currentDate);

  const rangeEnd =
    effectiveView === "day"
      ? currentDate
      : effectiveView === "week"
        ? endOfWeek(currentDate, { weekStartsOn: 1 })
        : endOfMonth(currentDate);

  const rangeAppointments = useMemo(() => {
    const from = format(rangeStart, "yyyy-MM-dd");
    const to = format(rangeEnd, "yyyy-MM-dd");
    return filtered.filter(
      (a) => isAppointmentActive(a) && isAppointmentInDateRange(a, from, to)
    );
  }, [filtered, rangeStart, rangeEnd]);

  const gridDoctors = useMemo(() => {
    if (isAssistant) {
      return getDoctorsFromAssistantAppointments(rangeAppointments, doctors);
    }
    let list = allDoctors;
    if (doctorFilter !== "all") {
      list = list.filter((d) => d.id === doctorFilter);
    } else if (cabinetFilter !== "all") {
      const inCabinet = getDoctorsInCabinet(cabinetFilter, doctors, cabinets);
      list = inCabinet.length > 0 ? inCabinet : [];
    }
    if (effectiveView !== "day") return list;
    const dayDoctorIds = new Set(
      rangeAppointments
        .filter((a) => isAppointmentOnCalendarDay(a, currentDate) && a.doctorId)
        .map((a) => a.doctorId as string)
    );
    return list.filter(
      (d) =>
        isDoctorWorkingOnDate(d.id, scheduleDate, doctorSchedules) || dayDoctorIds.has(d.id)
    );
  }, [
    isAssistant,
    rangeAppointments,
    doctors,
    allDoctors,
    doctorFilter,
    cabinetFilter,
    cabinets,
    doctorSchedules,
    scheduleDate,
    effectiveView,
    currentDate,
  ]);

  const goToDate = (value: string) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    setCurrentDate(parseISO(value));
  };

  const navigate = (dir: -1 | 1) => {
    if (effectiveView === "day") setCurrentDate((d) => addDays(d, dir));
    else if (effectiveView === "week") {
      setCurrentDate((d) => (dir === 1 ? addWeeks(d, 1) : subWeeks(d, 1)));
    }
    else setCurrentDate((d) => (dir === 1 ? addMonths(d, 1) : subMonths(d, 1)));
  };

  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [currentDate]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [currentDate]);

  const openNew = (date?: string, time?: string, doctorId?: string) => {
    setSelectedId(null);
    const slot = date ?? format(currentDate, "yyyy-MM-dd");
    setNewSlotDate(slot);
    setNewSlotTime(time);
    setNewSlotDoctorId(doctorId);
    if (date) setCurrentDate(parseISO(date));
    setModalOpen(true);
  };

  const openEdit = (apt: Appointment) => {
    setSelectedId(apt.id);
    setModalOpen(true);
  };

  const handleDoctorFilter = (value: string) => {
    setDoctorFilter(value);
    if (value !== "all") setCabinetFilter("all");
  };

  const handleCabinetFilter = (cabinetId: string) => {
    setCabinetFilter(cabinetId);
    if (cabinetId !== "all") setDoctorFilter("all");
  };

  const titleLabel =
    effectiveView === "day"
      ? format(currentDate, "EEEE, d MMMM yyyy", { locale: ru })
          .replace(/^./, (c) => c.toUpperCase())
      : effectiveView === "week"
        ? `${format(weekDays[0], "d MMM", { locale: ru })} - ${format(weekDays[6], "d MMM yyyy", { locale: ru })}`
        : format(currentDate, "LLLL yyyy", { locale: ru });

  const filterHint = isAssistant
    ? rangeAppointments.length > 0
      ? `Ваши приёмы за период: ${rangeAppointments.length}${
          gridDoctors.length
            ? ` · врачи: ${gridDoctors.map((d) => d.name).join(", ")}`
            : ""
        }`
      : "Нет записей, где вы указаны ассистентом — администратор добавляет вас при создании приёма"
    : doctorFilter !== "all"
      ? `Расписание: ${allDoctors.find((d) => d.id === doctorFilter)?.name ?? "врач"}`
      : cabinetFilter !== "all"
        ? `Кабинет: ${cabinets.find((c) => c.id === cabinetFilter)?.name ?? ""} · врачей: ${gridDoctors.length}`
        : "Все врачи и кабинеты";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Расписание</h1>
          <p className="text-sm text-slate-500">
            Приём с {SCHEDULE_DAY_START} до {SCHEDULE_DAY_END}
          </p>
        </div>
        {!isAssistant && (
          <Button onClick={() => openNew()}>
            <Plus className="h-4 w-4" />
            Новая запись
          </Button>
        )}
      </div>

      {scheduleReminder && !isAssistant && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="py-3 text-sm text-amber-900">
            Составьте график смен на{" "}
            <strong>{formatScheduleMonthLabel(scheduleReminder.month)}</strong> в разделе{" "}
            <strong>«Сотрудники»</strong> ({scheduleReminder.missingDoctorIds.length}{" "}
            врач(ей) без графика). Если график не обновить — в расписании останется прошлый
            месяц.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={() => navigate(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <CardTitle className="text-lg capitalize">{titleLabel}</CardTitle>
            <Input
              type="date"
              aria-label="Перейти к дате"
              className="h-9 w-[10.5rem] shrink-0"
              value={format(currentDate, "yyyy-MM-dd")}
              onChange={(e) => goToDate(e.target.value)}
            />
            <Button variant="ghost" size="sm" onClick={() => setCurrentDate(new Date())}>
              {UI.today}
            </Button>
          </div>
          {!isMobile ? (
            <div className="flex flex-wrap gap-2">
              {(["day", "week", "month"] as ViewMode[]).map((v) => (
                <Button
                  key={v}
                  variant={view === v ? "default" : "outline"}
                  size="sm"
                  onClick={() => setView(v)}
                >
                  {VIEW_MODE_LABELS[v]}
                </Button>
              ))}
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3 border-t border-slate-100 pt-4">
          <p className="text-sm font-medium text-teal-800">{filterHint}</p>
          <div className="flex flex-wrap items-center gap-4">
            {!isAssistant && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <span className="shrink-0 font-medium">Врач:</span>
              <select
                className="h-10 min-w-[11rem] rounded-lg border border-slate-200 px-3 text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-400"
                value={doctorFilter}
                onChange={(e) => handleDoctorFilter(e.target.value)}
                disabled={cabinetFilter !== "all"}
              >
                <option value="all">{UI.allDoctors}</option>
                {allDoctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            )}
            {!isAssistant && cabinets.length > 0 && (
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <span className="shrink-0 font-medium">Кабинет:</span>
                <select
                  className="h-10 min-w-[200px] rounded-lg border border-slate-200 px-3 text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-400"
                  value={cabinetFilter}
                  onChange={(e) => handleCabinetFilter(e.target.value)}
                  disabled={doctorFilter !== "all"}
                >
                  <option value="all">{UI.allCabinets}</option>
                  {cabinets.map((cab) => (
                    <option key={cab.id} value={cab.id}>
                      {cab.name} №{cab.number}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </CardContent>
      </Card>

      {effectiveView === "month" && !isMobile && (
        <Card>
          <CardContent className="p-4">
            <div className="mb-2 grid grid-cols-7 gap-1 text-center text-sm font-medium text-slate-500">
              {WEEKDAY_SHORT.map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {monthDays.map((day) => {
                const dayStr = format(day, "yyyy-MM-dd");
                const dayApts = filtered
                  .filter(
                    (a) => isAppointmentActive(a) && normalizeAppointmentDate(a.date) === dayStr
                  )
                  .sort((a, b) => a.startTime.localeCompare(b.startTime));
                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "flex min-h-24 flex-col rounded-lg border p-2 text-sm transition-colors hover:border-teal-300",
                      isSameMonth(day, currentDate) ? "bg-white" : "bg-slate-50 text-slate-400",
                      isSameDay(day, new Date()) && "border-teal-500 ring-1 ring-teal-500"
                    )}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <button
                        type="button"
                        className="font-semibold hover:text-teal-700"
                        onClick={() => {
                          setCurrentDate(day);
                          setView("day");
                        }}
                      >
                        {format(day, "d")}
                      </button>
                      <button
                        type="button"
                        className="rounded p-0.5 text-slate-400 hover:bg-teal-50 hover:text-teal-700"
                        title="Новая запись на этот день"
                        onClick={() => openNew(dayStr)}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-1 flex-1 space-y-0.5">
                      {dayApts.slice(0, 3).map((apt) => {
                        const patient = patients.find((p) => p.id === apt.patientId);
                        const doctor = apt.doctorId
                          ? doctors.find((d) => d.id === apt.doctorId)
                          : undefined;
                        const linkedAct = resolveAppointmentWorkAct(apt, workActs);
                        const statusLabel = getScheduleAppointmentStatusLabel(
                          apt,
                          linkedAct,
                          payments
                        );
                        return (
                          <button
                            key={apt.id}
                            type="button"
                            onClick={() => openEdit(apt)}
                            className={cn(
                              "block w-full truncate rounded px-1 py-0.5 text-left text-xs font-medium",
                              getScheduleAppointmentCellClass(apt, linkedAct, payments)
                            )}
                            title={
                              doctor
                                ? `${apt.startTime} · ${doctor.name} · ${statusLabel}${
                                    linkedAct ? ` · Акт № ${linkedAct.actNumber}` : ""
                                  }`
                                : `${apt.startTime} · ${statusLabel}`
                            }
                          >
                            {apt.startTime}{" "}
                            {patient
                              ? getFullName(
                                  patient.firstName,
                                  patient.lastName,
                                  patient.middleName
                                )
                              : "Без пациента"}
                            {linkedAct ? ` · №${linkedAct.actNumber}` : ""}
                          </button>
                        );
                      })}
                      {dayApts.length > 3 && (
                        <span className="text-xs text-slate-400">+{dayApts.length - 3}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {(effectiveView === "week" || effectiveView === "day") && (
        <>
          {gridDoctors.length === 0 && cabinetFilter !== "all" ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-slate-500">
                В выбранном кабинете нет привязанных врачей. Назначьте сотрудников в разделе
                «Сотрудники».
              </CardContent>
            </Card>
          ) : (
            <ScheduleGrid
              days={effectiveView === "day" ? [currentDate] : weekDays}
              doctors={gridDoctors}
              appointments={rangeAppointments}
              patients={patients}
              workActs={workActs}
              payments={payments}
              doctorSchedules={doctorSchedules}
              onSlotClick={(date, time, doctorId) => openNew(date, time, doctorId)}
              onAppointmentClick={openEdit}
              onActClick={(actId) => setViewActId(actId)}
            />
          )}
        </>
      )}

      {effectiveView === "day" && rangeAppointments.length > 0 && (
        <p className="text-sm text-slate-500">{rangeAppointments.length} записей за день</p>
      )}

      <AppointmentModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        appointment={selected}
        defaultDate={selected ? undefined : newSlotDate}
        defaultTime={selected ? undefined : newSlotTime}
        defaultDoctorId={selected ? undefined : newSlotDoctorId}
        onOpenAct={(actId) => {
          setModalOpen(false);
          setViewActId(actId);
        }}
      />
      <WorkActModal
        open={!!viewActId}
        onOpenChange={(open) => !open && setViewActId(null)}
        existingActId={viewActId ?? undefined}
        mode="admin_view"
      />
    </div>
  );
}
