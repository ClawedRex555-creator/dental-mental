"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ONLINE_BOOKING_STATUS_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { useClinicStore } from "@/store/useClinicStore";
import { toast } from "sonner";

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
  } = useClinicStore();

  const medflexAppointments = appointments
    .filter(
      (a) =>
        Boolean(a.externalClaimId) ||
        (a.externalSource &&
          /prodoctorov|medflex/i.test(a.externalSource))
    )
    .slice()
    .sort((a, b) => {
      const da = `${a.date} ${a.startTime}`;
      const db = `${b.date} ${b.startTime}`;
      return db.localeCompare(da);
    });

  const handleStatus = (id: string, status: "contacted" | "booked" | "cancelled") => {
    updateOnlineBooking(id, { status });
    toast.success("Заявка обновлена");
  };

  const total = medflexAppointments.length + onlineBookings.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Онлайн-запись</h1>
        <p className="text-sm text-slate-500">
          Записи из ПроДокторов / MedFlex сразу попадают в расписание; здесь — сводка
        </p>
      </div>

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
            const phone = patients.find((p) => p.id === apt.patientId)?.phone;
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
                    <Link href="/schedule">В расписание</Link>
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
            Ещё не созданы как приём — нужно связаться или записать вручную
          </p>
        </div>
        <div className="divide-y divide-slate-100">
          {onlineBookings.length === 0 && (
            <p className="p-6 text-center text-sm text-slate-500">Заявок пока нет</p>
          )}
          {onlineBookings.map((booking) => {
            const service = services.find((s) => s.id === booking.serviceId);
            const doctor = booking.doctorId
              ? doctors.find((d) => d.id === booking.doctorId)
              : undefined;
            return (
              <div
                key={booking.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-slate-900">{booking.patientName}</p>
                  <p className="text-sm text-slate-500">{booking.phone}</p>
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
                        onClick={() => handleStatus(booking.id, "contacted")}
                      >
                        Связались
                      </Button>
                      <Button size="sm" onClick={() => handleStatus(booking.id, "booked")}>
                        Записан
                      </Button>
                    </>
                  )}
                  {booking.status !== "cancelled" && booking.status !== "booked" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleStatus(booking.id, "cancelled")}
                    >
                      Отменить
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <CardContent className="border-t border-slate-100 py-3 text-xs text-slate-500">
          Заявок с формы: {onlineBookings.length} · всего на вкладке: {total}
        </CardContent>
      </Card>
    </div>
  );
}
