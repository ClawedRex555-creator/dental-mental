"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ONLINE_BOOKING_STATUS_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { useClinicStore } from "@/store/useClinicStore";
import { toast } from "sonner";

export default function OnlineBookingPage() {
  const { onlineBookings, updateOnlineBooking, doctors, services } = useClinicStore();

  const handleStatus = (id: string, status: "contacted" | "booked" | "cancelled") => {
    updateOnlineBooking(id, { status });
    toast.success("Заявка обновлена");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Онлайн-запись</h1>
        <p className="text-sm text-slate-500">Заявки с публичной формы записи</p>
      </div>

      <Card>
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
          Заявок: {onlineBookings.length}
        </CardContent>
      </Card>
    </div>
  );
}
