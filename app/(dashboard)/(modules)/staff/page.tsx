"use client";

import { useState } from "react";
import { Calendar, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DoctorModal } from "@/components/staff/doctor-modal";
import { DoctorScheduleModal } from "@/components/staff/doctor-schedule-modal";
import { CabinetModal } from "@/components/staff/cabinet-modal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  markClinicSyncedAfterCommand,
  notifyClinicDataChanged,
  requestForcePullClinicDataFromServer,
} from "@/lib/clinic-data-sync.client";
import { clearPendingClinicSnapshot } from "@/lib/clinic-pending-sync";
import { ROLE_LABELS } from "@/lib/constants";
import { deleteStaffOnServer } from "@/lib/clinic-staff-client";
import {
  assignStaffToCabinetViaCommandApi,
  deleteCabinetViaCommandApi,
} from "@/lib/clinic-snapshot-command.client";
import type { Doctor } from "@/lib/types";
import { runWithoutClinicFlush, useClinicStore } from "@/store/useClinicStore";

export default function StaffPage() {
  const { doctors, cabinets, assignStaffToCabinet, removeDoctor, removeCabinet } =
    useClinicStore();
  const [doctorModalOpen, setDoctorModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Doctor | null>(null);
  const [cabinetModalOpen, setCabinetModalOpen] = useState(false);
  const [scheduleDoctor, setScheduleDoctor] = useState<Doctor | null>(null);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);

  const openAdd = () => {
    setEditingMember(null);
    setDoctorModalOpen(true);
  };

  const openEdit = (member: Doctor) => {
    setEditingMember(member);
    setDoctorModalOpen(true);
  };

  const handleRemoveDoctor = async (member: Doctor) => {
    if (
      !window.confirm(
        `Удалить сотрудника «${member.name}»? Записи и акты останутся, но без привязки к этому сотруднику.\n\nВажно: доступ к входу будет отключён.`
      )
    ) {
      return;
    }
    // 1) clinic_snapshots + auth_users + staff_members на сервере
    const staffRes = await deleteStaffOnServer(member.id);
    if (!staffRes.ok) {
      toast.error(staffRes.error ?? "Не удалось удалить сотрудника в базе");
      return;
    }

    // 2) локально: без flush и без pending-буфера (иначе merge возвращал сотрудника)
    clearPendingClinicSnapshot();
    useClinicStore.getState().pauseClinicAutoSave();
    useClinicStore.getState().setClinicDataSaveError(null);
    useClinicStore.getState().setClinicSaveStatus("idle");
    runWithoutClinicFlush(() => {
      removeDoctor(member.id, { skipFlush: true });
    });
    await requestForcePullClinicDataFromServer({
      force: true,
      allowApplyDespitePending: true,
      allowDuringSaveCooldown: true,
    });
    markClinicSyncedAfterCommand(staffRes.updatedAt, staffRes.revision);

    toast.success("Сотрудник удалён, доступ отключён");
  };

  const handleAssignStaffToCabinet = async (cabId: string, staffId: string) => {
    const api = await assignStaffToCabinetViaCommandApi(cabId, staffId);
    if (!api.ok) {
      toast.error(api.error ?? "Не удалось назначить сотрудника в кабинет");
      return;
    }
    runWithoutClinicFlush(() => {
      assignStaffToCabinet(cabId, staffId);
    });
    markClinicSyncedAfterCommand(api.updatedAt, api.revision);
    useClinicStore.getState().pauseClinicAutoSave(15_000);
    notifyClinicDataChanged();
    toast.success("Сотрудник назначен в кабинет");
  };

  const handleRemoveCabinet = async (cabId: string, cabName: string) => {
    if (
      !window.confirm(
        `Удалить кабинет «${cabName}»? Сотрудники будут откреплены от кабинета.`
      )
    ) {
      return;
    }
    const api = await deleteCabinetViaCommandApi(cabId);
    if (!api.ok) {
      toast.error(api.error ?? "Не удалось удалить кабинет");
      return;
    }
    runWithoutClinicFlush(() => {
      removeCabinet(cabId);
    });
    markClinicSyncedAfterCommand(api.updatedAt, api.revision);
    useClinicStore.getState().pauseClinicAutoSave(15_000);
    notifyClinicDataChanged();
    toast.success("Кабинет удалён");
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Сотрудники</h1>
        <p className="text-sm text-slate-500">Команда клиники и кабинеты</p>
      </div>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Команда</h2>
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4" />
            Добавить сотрудника
          </Button>
        </div>

        {doctors.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-slate-500">
              Пока нет сотрудников. Добавьте первого врача или администратора.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {doctors.map((member) => (
              <Card key={member.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{member.name}</CardTitle>
                      <p className="text-sm text-slate-500">
                        {(member.specializations?.length
                          ? member.specializations
                          : [member.specialization]
                        )
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge variant="secondary">
                        {ROLE_LABELS[member.role] ?? member.role}
                      </Badge>
                      <div className="flex gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEdit(member)}
                          title="Редактировать"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => handleRemoveDoctor(member)}
                          title="Удалить"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1 text-sm text-slate-600">
                  <p>Кабинет: {member.cabinet}</p>
                  <p>Тел.: {member.phone}</p>
                  {member.email && <p>{member.email}</p>}
                  {member.address && <p>Адрес: {member.address}</p>}
                  {member.diplomaCertificate && (
                    <p>Сертификат: {member.diplomaCertificate}</p>
                  )}
                  {member.role === "doctor" && (
                    <>
                      <p className="text-teal-700">Комиссия: {member.commissionPercent}%</p>
                      {member.implantFee != null && member.implantFee > 0 && (
                        <p className="text-teal-700">
                          Имплантация:{" "}
                          {member.implantFeeType === "rubles"
                            ? `${member.implantFee} ₽/ед.`
                            : `${member.implantFee}%`}
                        </p>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => {
                          setScheduleDoctor(member);
                          setScheduleModalOpen(true);
                        }}
                      >
                        <Calendar className="mr-1 h-4 w-4" />
                        График смен
                      </Button>
                    </>
                  )}
                  {member.role === "assistant" && member.hourlyRate != null && (
                    <p className="text-teal-700">
                      Ставка: {member.hourlyRate} ₽/час
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Кабинеты</h2>
          <Button variant="outline" onClick={() => setCabinetModalOpen(true)}>
            <Plus className="h-4 w-4" />
            Добавить кабинет
          </Button>
        </div>
        {cabinets.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-slate-500">
              Кабинеты не созданы. Добавьте кабинет и назначьте в него сотрудников.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {cabinets.map((cab) => (
              <Card key={cab.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">
                      {cab.name} №{cab.number}
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => void handleRemoveCabinet(cab.id, `${cab.name} №${cab.number}`)}
                      title="Удалить кабинет"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="text-slate-500">Сотрудники в кабинете:</p>
                  {doctors
                    .filter(
                      (d) =>
                        d.cabinetId === cab.id || (cab.staffIds ?? []).includes(d.id)
                    )
                    .map((d) => (
                      <p key={d.id}>
                        {d.name} · {ROLE_LABELS[d.role]}
                      </p>
                    ))}
                  <select
                    className="mt-2 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm text-slate-900"
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) {
                        void handleAssignStaffToCabinet(cab.id, e.target.value);
                      }
                      e.target.value = "";
                    }}
                  >
                    <option value="">+ Назначить сотрудника</option>
                    {doctors
                      .filter((d) => !(cab.staffIds ?? []).includes(d.id))
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                  </select>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <DoctorModal
        open={doctorModalOpen}
        onOpenChange={setDoctorModalOpen}
        member={editingMember}
      />
      <DoctorScheduleModal
        open={scheduleModalOpen}
        onOpenChange={setScheduleModalOpen}
        doctor={scheduleDoctor}
      />
      <CabinetModal open={cabinetModalOpen} onOpenChange={setCabinetModalOpen} />
    </div>
  );
}
