"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ONLINE_BOOKING_STATUS_LABELS } from "@/lib/constants";
import { updateOnlineBookingViaCommandApi } from "@/lib/clinic-online-booking.client";
import {
  countPendingOnlineBookings,
  isMedflexBookingAppointment,
  isPendingOnlineBooking,
} from "@/lib/online-booking";
import {
  beginClinicCommandMutation,
  endClinicCommandMutation,
  useClinicStore,
} from "@/store/useClinicStore";
import {
  markClinicSyncedAfterCommand,
  notifyClinicDataChanged,
  requestForcePullClinicDataFromServer,
} from "@/lib/clinic-data-sync.client";
import { canViewPatientPhone } from "@/lib/rbac";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import type { OnlineBookingStatus } from "@/lib/types";

function patientLabel(
  patients: ReturnType<typeof useClinicStore.getState>["patients"],
  patientId: string
): string {
  const p = patients.find((x) => x.id === patientId);
  if (!p) return "Пациент";
  return [p.lastName, p.firstName, p.middleName].filter(Boolean).join(" ");
}

function appointmentStatusLabel(status: string): string {
  if (status === "cancelled") return "Отменена";
  if (status === "completed") return "Завершена";
  if (status === "confirmed") return "Подтверждена";
  return "В расписании";
}

export default function OnlineBookingPage() {
  const {
    onlineBookings,
    updateOnlineBooking,
    appointments,
    patients,
    doctors,
    services,
    currentUser,
  } = useClinicStore();
  const showPhone = canViewPatientPhone(currentUser.role);
  const [busyId, setBusyId] = useState<string | null>(null);

  const medflexAppointments = appointments
    .filter(isMedflexBookingAppointment)
    .slice()
    .sort((a, b) => {
      const da = `${a.date} ${a.startTime}`;
      const db = `${b.date} ${b.startTime}`;
      return db.localeCompare(da);
    });

  const pendingBookings = onlineBookings.filter(isPendingOnlineBooking);
  const pendingCount = countPendingOnlineBookings(onlineBookings);
  const bookedFromApp = onlineBookings.filter((b) => b.status === "booked");

  const handleStatus = async (
    id: string,
    status: Extract<OnlineBookingStatus, "contacted" | "booked" | "cancelled">
  ) => {
    setBusyId(id);
    beginClinicCommandMutation();
    updateOnlineBooking(id, { status });

    const api = await updateOnlineBookingViaCommandApi(id, status);
    if (!api.ok) {
      endClinicCommandMutation();
      setBusyId(null);
      toast.error(api.error ?? "Не удалось обновить заявку");
      await requestForcePullClinicDataFromServer({
        force: true,
        allowApplyDespitePending: true,
      });
      return;
    }

    markClinicSyncedAfterCommand(api.updatedAt, api.revision);
    endClinicCommandMutation();
    setBusyId(null);
    notifyClinicDataChanged();

    if (status === "booked") {
      toast.success("Заявка записана — приём появился в расписании");
    } else if (status === "contacted") {
      toast.success("Отмечено: связались с пациентом");
    } else {
      toast.success("Заявка отменена");
    }
  };

  const total = medflexAppointments.length + onlineBookings.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Онлайн-запись
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Записи из ПроДокторов / MedFlex и приложения сразу попадают в расписание
        </p>
      </div>

      {pendingCount > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100/90">
          <p className="font-medium">
            {pendingCount === 1
              ? "1 пациент хочет записаться"
              : `${pendingCount} пациентов хотят записаться`}
          </p>
          <p className="mt-1 text-amber-900/80 dark:text-amber-100/70">
            Отметьте «Связались» или «Записан» в списке ниже — заявки со статусом «Новая»
            ждут ответа администратора.
          </p>
        </div>
      )}

      <Card>
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">
            ПроДокторов / MedFlex
          </h2>
          <p className="text-xs text-slate-500">
            Уже созданы как приёмы в расписании
          </p>
        </div>
        <div className="divide-y divide-slate-100">
          {medflexAppointments.length === 0 && (
            <p className="p-6 text-center text-sm text-slate-500">
              Записей из MedFlex пока нет. Если запись только что пришла — обновите данные
              клиники (синхронизация).
            </p>
          )}
          {medflexAppointments.map((apt) => {
            const doctor = doctors.find((d) => d.id === apt.doctorId);
            const phone = showPhone
              ? patients.find((p) => p.id === apt.patientId)?.phone
              : undefined;
            return (
              <div
                key={apt.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-slate-900">
                    {patientLabel(patients, apt.patientId)}
                  </p>
                  {phone && <p className="text-sm text-slate-500">{phone}</p>}
                  <p className="mt-1 text-sm">
                    {formatDate(apt.date)} {apt.startTime}–{apt.endTime}
                    {doctor ? ` · ${doctor.name}` : ""}
                  </p>
                  {apt.comment && (
                    <p className="mt-1 text-sm text-slate-600">{apt.comment}</p>
                  )}
                  <p className="mt-1 text-xs text-slate-400">
                    {apt.externalSource ?? "MedFlex"}
                    {apt.externalClaimId
                      ? ` · claim ${apt.externalClaimId.slice(0, 8)}…`
                      : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={apt.status === "cancelled" ? "secondary" : "default"}
                  >
                    {appointmentStatusLabel(apt.status)}
                  </Badge>
                  <Button size="sm" variant="outline" asChild>
                    <Link href="/appointments">В расписание</Link>
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/patients/${apt.patientId}`}>Карточка</Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        <CardContent className="border-t border-slate-100 py-3 text-xs text-slate-500">
          MedFlex: {medflexAppointments.length}
        </CardContent>
      </Card>

      <Card>
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Заявки с формы / приложения
          </h2>
          <p className="text-xs text-slate-500">
            Из приложения — сразу в расписании с пометкой «Запись через приложение».
            Новые заявки с формы — отметьте «Связались» или «Записан».
          </p>
        </div>
        <div className="divide-y divide-slate-100">
          {pendingBookings.length === 0 && bookedFromApp.length === 0 && (
            <p className="p-6 text-center text-sm text-slate-500">Заявок пока нет</p>
          )}
          {pendingBookings.map((booking) => {
            const service = services.find((s) => s.id === booking.serviceId);
            const doctor = booking.doctorId
              ? doctors.find((d) => d.id === booking.doctorId)
              : undefined;
            const isBusy = busyId === booking.id;
            return (
              <div
                key={booking.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-slate-900">{booking.patientName}</p>
                  {showPhone && (
                    <p className="text-sm text-slate-500">{booking.phone}</p>
                  )}
                  <p className="mt-1 text-sm">
                    {service?.name} - {formatDate(booking.date)} {booking.time}
                    {doctor ? ` - ${doctor.name}` : ""}
                  </p>
                  {booking.comment && (
                    <p className="mt-1 text-sm text-slate-600">{booking.comment}</p>
                  )}
                  <p className="mt-1 text-xs text-slate-400">
                    Получена {formatDate(booking.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={booking.status === "new" ? "default" : "secondary"}>
                    {ONLINE_BOOKING_STATUS_LABELS[booking.status]}
                  </Badge>
                  {booking.status === "new" && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isBusy}
                        onClick={() => handleStatus(booking.id, "contacted")}
                      >
                        Связались
                      </Button>
                      <Button
                        size="sm"
                        disabled={isBusy}
                        onClick={() => handleStatus(booking.id, "booked")}
                      >
                        Записан
                      </Button>
                    </>
                  )}
                  {booking.status === "contacted" && (
                    <Button
                      size="sm"
                      disabled={isBusy}
                      onClick={() => handleStatus(booking.id, "booked")}
                    >
                      Записан
                    </Button>
                  )}
                  {booking.status !== "cancelled" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isBusy}
                      onClick={() => handleStatus(booking.id, "cancelled")}
                    >
                      Отменить
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          {bookedFromApp.map((booking) => {
            const service = services.find((s) => s.id === booking.serviceId);
            const doctor = booking.doctorId
              ? doctors.find((d) => d.id === booking.doctorId)
              : undefined;
            const apt = appointments.find(
              (a) => a.id === booking.appointmentId || a.externalClaimId === booking.id
            );
            return (
              <div
                key={`booked-${booking.id}`}
                className="flex flex-col gap-3 bg-slate-50/50 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-slate-900">{booking.patientName}</p>
                  {showPhone && (
                    <p className="text-sm text-slate-500">{booking.phone}</p>
                  )}
                  <p className="mt-1 text-sm">
                    {service?.name} - {formatDate(booking.date)} {booking.time}
                    {doctor ? ` - ${doctor.name}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-teal-700">
                    Запись через приложение · в расписании
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{ONLINE_BOOKING_STATUS_LABELS.booked}</Badge>
                  <Button size="sm" variant="outline" asChild>
                    <Link href="/appointments">В расписание</Link>
                  </Button>
                  {apt && (
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/patients/${apt.patientId}`}>Карточка</Link>
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <CardContent className="border-t border-slate-100 py-3 text-xs text-slate-500">
          Ожидают обработки: {pendingBookings.length} · записаны: {bookedFromApp.length} ·
          всего на вкладке: {total}
        </CardContent>
      </Card>
    </div>
  );
}
