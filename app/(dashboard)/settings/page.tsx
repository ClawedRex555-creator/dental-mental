"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ClinicWeeklyHoursForm } from "@/components/settings/clinic-weekly-hours-form";
import { ROLE_LABELS, UI } from "@/lib/constants";
import { defaultWeeklySchedule } from "@/lib/clinic-schedule";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import type { ClinicSettings } from "@/lib/types";
import { useClinicStore } from "@/store/useClinicStore";
import { toast } from "sonner";

export default function SettingsPage() {
  const {
    currentUser,
    clinicSettings,
    updateClinicSettings,
    updateCurrentUser,
    resetAllData,
  } = useClinicStore();
  const currentRole = currentUser.role;
  const [resetConfirm, setResetConfirm] = useState(false);
  const isLimitedStaff =
    currentRole === "doctor" ||
    currentRole === "assistant" ||
    currentRole === "accountant";
  const canManageClinic = currentRole === "owner" || currentRole === "admin";

  const [clinicForm, setClinicForm] = useState<ClinicSettings>({
    ...clinicSettings,
    weeklySchedule: clinicSettings.weeklySchedule ?? defaultWeeklySchedule(),
  });
  const [userName, setUserName] = useState(currentUser.name);
  const [userEmail, setUserEmail] = useState(currentUser.email);

  useEffect(() => {
    setClinicForm({
      ...clinicSettings,
      weeklySchedule: clinicSettings.weeklySchedule ?? defaultWeeklySchedule(),
    });
  }, [clinicSettings]);

  useEffect(() => {
    setUserName(currentUser.name);
    setUserEmail(currentUser.email);
  }, [currentUser.name, currentUser.email]);

  const setClinicField = <K extends keyof ClinicSettings>(key: K, value: ClinicSettings[K]) => {
    setClinicForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveClinic = () => {
    if (!clinicForm.name.trim()) {
      toast.error("Укажите название клиники");
      return;
    }
    updateClinicSettings({
      name: clinicForm.name.trim(),
      phone: clinicForm.phone.trim(),
      email: clinicForm.email.trim(),
      address: clinicForm.address.trim(),
      inn: clinicForm.inn.trim(),
      weeklySchedule: clinicForm.weeklySchedule ?? defaultWeeklySchedule(),
      logo: clinicForm.logo?.trim() || undefined,
    });
    toast.success("Настройки клиники сохранены");
  };

  const handleSaveAccount = () => {
    if (!userName.trim()) {
      toast.error("Укажите имя");
      return;
    }
    updateCurrentUser({
      name: userName.trim(),
      email: userEmail.trim(),
    });
    toast.success("Профиль обновлён");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Настройки</h1>
        <p className="text-sm text-slate-500">
          {isLimitedStaff ? "Профиль и тема интерфейса" : "Профиль клиники и параметры"}
        </p>
      </div>

      {canManageClinic && (
      <Card>
        <CardHeader>
          <CardTitle>Профиль клиники</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Название</Label>
            <Input
              value={clinicForm.name}
              onChange={(e) => setClinicField("name", e.target.value)}
              placeholder="Стоматология «Улыбка»"
            />
          </div>
          <div className="space-y-2">
            <Label>{UI.phone}</Label>
            <Input
              value={clinicForm.phone}
              onChange={(e) => setClinicField("phone", e.target.value)}
              placeholder="+7 (999) 000-00-00"
            />
          </div>
          <div className="space-y-2">
            <Label>{UI.email}</Label>
            <Input
              type="email"
              value={clinicForm.email}
              onChange={(e) => setClinicField("email", e.target.value)}
              placeholder="info@clinic.ru"
            />
          </div>
          <div className="space-y-2">
            <Label>ИНН</Label>
            <Input
              value={clinicForm.inn}
              onChange={(e) => setClinicField("inn", e.target.value)}
              placeholder="7700000000"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Адрес</Label>
            <Input
              value={clinicForm.address}
              onChange={(e) => setClinicField("address", e.target.value)}
              placeholder="г. Москва, ул. Примерная, 1"
            />
          </div>
          <div className="sm:col-span-2">
            <ClinicWeeklyHoursForm
              value={clinicForm.weeklySchedule ?? defaultWeeklySchedule()}
              onChange={(weeklySchedule) => setClinicField("weeklySchedule", weeklySchedule)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>URL логотипа (для печати актов)</Label>
            <Input
              value={clinicForm.logo ?? ""}
              onChange={(e) => setClinicField("logo", e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div className="sm:col-span-2">
            <Button onClick={handleSaveClinic}>{UI.save}</Button>
          </div>
        </CardContent>
      </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Ваш аккаунт</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Имя</Label>
              <Input value={userName} onChange={(e) => setUserName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{UI.email}</Label>
              <Input
                type="email"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2 max-w-md border-t border-[var(--border)] pt-4">
            <Label>Тема интерфейса</Label>
            <ThemeToggle showLabels />
            <p className="text-xs text-[var(--muted)]">
              Сохраняется отдельно для вашего входа. Другие сотрудники могут выбрать свою тему.
            </p>
          </div>
          <p className="text-sm text-[var(--muted)]">
            Роль: <strong>{ROLE_LABELS[currentRole]}</strong>. Для смены роли используйте
            отдельный вход (email и пароль сотрудника).
          </p>
          <Button onClick={handleSaveAccount}>{UI.save} профиль</Button>
        </CardContent>
      </Card>

      {canManageClinic && (
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="text-red-800">Очистить все данные</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-600">
            Удалятся все пациенты, сотрудники, кабинеты, услуги, записи, акты, платежи,
            документы юр. отдела и прочие данные. Настройки клиники и профиль администратора
            сбросятся к начальным. Действие необратимо.
          </p>
          {!resetConfirm ? (
            <Button variant="outline" className="border-red-300 text-red-700 hover:bg-red-50" onClick={() => setResetConfirm(true)}>
              Очистить систему…
            </Button>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="destructive"
                onClick={() => {
                  resetAllData();
                  setResetConfirm(false);
                  setClinicForm(useClinicStore.getState().clinicSettings);
                  toast.success("Все данные удалены. Можно заполнять с нуля.");
                  window.location.reload();
                }}
              >
                Да, удалить всё
              </Button>
              <Button variant="outline" onClick={() => setResetConfirm(false)}>
                Отмена
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      )}
    </div>
  );
}
