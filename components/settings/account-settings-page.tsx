"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ClinicWeeklyHoursForm } from "@/components/settings/clinic-weekly-hours-form";
import { ROLE_LABELS, UI } from "@/lib/constants";
import { normalizeWeeklySchedule } from "@/lib/clinic-schedule";
import { sanitizeHttpImageUrl } from "@/lib/safe-url";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import type { ClinicSettings, UserRole } from "@/lib/types";
import { ModuleGate } from "@/components/clinic/module-guard";
import { PanelErrorBoundary } from "@/components/shared/panel-error-boundary";
import { useClinicStore } from "@/store/useClinicStore";
import { toast } from "sonner";

const ComplianceSettingsPanel = dynamic(
  () =>
    import("@/components/settings/compliance-settings-panel").then((m) => ({
      default: m.ComplianceSettingsPanel,
    })),
  { ssr: false }
);

const EgiszSettingsPanel = dynamic(
  () =>
    import("@/components/settings/egisz-settings-panel").then((m) => ({
      default: m.EgiszSettingsPanel,
    })),
  { ssr: false }
);

function roleLabel(role: UserRole): string {
  return ROLE_LABELS[role] ?? role;
}

export default function AccountSettingsPage() {
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
    weeklySchedule: normalizeWeeklySchedule(clinicSettings.weeklySchedule),
  });
  const [userName, setUserName] = useState(currentUser.name);
  const [userEmail, setUserEmail] = useState(currentUser.email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingAccount, setSavingAccount] = useState(false);

  useEffect(() => {
    setClinicForm({
      ...clinicSettings,
      weeklySchedule: normalizeWeeklySchedule(clinicSettings.weeklySchedule),
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
      weeklySchedule: normalizeWeeklySchedule(clinicForm.weeklySchedule),
      logo: sanitizeHttpImageUrl(clinicForm.logo?.trim()) || undefined,
    });
    toast.success("Настройки клиники сохранены");
  };

  const handleSaveAccount = async () => {
    if (!userName.trim()) {
      toast.error("Укажите имя");
      return;
    }
    const email = userEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      toast.error("Укажите корректный email для входа");
      return;
    }
    if (newPassword || confirmPassword || currentPassword) {
      if (!currentPassword) {
        toast.error("Для смены пароля введите текущий пароль");
        return;
      }
      if (newPassword.length < 8) {
        toast.error("Новый пароль не менее 8 символов");
        return;
      }
      if (newPassword !== confirmPassword) {
        toast.error("Новый пароль и подтверждение не совпадают");
        return;
      }
    }

    setSavingAccount(true);
    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: userName.trim(),
          login: email,
          ...(newPassword
            ? { password: newPassword, currentPassword }
            : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        user?: { name: string; email: string };
      };
      if (!res.ok) {
        toast.error(data.error ?? "Не удалось сохранить профиль");
        return;
      }
      if (data.user) {
        updateCurrentUser({
          name: data.user.name,
          email: data.user.email,
        });
      } else {
        updateCurrentUser({ name: userName.trim(), email });
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success(
        newPassword
          ? "Профиль и пароль сохранены. При следующем входе используйте новый пароль."
          : "Профиль сохранён — имя отобразится в шапке"
      );
    } catch {
      toast.error("Ошибка сети при сохранении профиля");
    } finally {
      setSavingAccount(false);
    }
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
              value={normalizeWeeklySchedule(clinicForm.weeklySchedule)}
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
              <Label>Email для входа</Label>
              <Input
                type="email"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                autoComplete="username"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 border-t border-[var(--border)] pt-4">
            <div className="space-y-2 sm:col-span-2">
              <p className="text-sm font-medium text-[var(--foreground)]">Смена пароля</p>
              <p className="text-xs text-[var(--muted)]">
                Оставьте пустым, если меняете только имя или email. Для владельца и всех
                ролей пароль хранится на сервере.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Текущий пароль</Label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-2">
              <Label>Новый пароль</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2 sm:col-span-2 max-w-md">
              <Label>Подтверждение нового пароля</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>
          <div className="space-y-2 max-w-md border-t border-[var(--border)] pt-4">
            <Label>Тема интерфейса</Label>
            <ThemeToggle showLabels />
            <p className="text-xs text-[var(--muted)]">
              Светлая или тёмная — только для вашего входа. У коллег могут быть другие настройки.
              Сохраняется на этом устройстве и синхронизируется с сервером клиники.
            </p>
          </div>
          <p className="text-sm text-[var(--muted)]">
            Роль: <strong>{roleLabel(currentRole)}</strong>. Имя в шапке справа — это поле
            «Имя» выше. Роль меняет владелец или администратор в «Сотрудники».
          </p>
          <Button onClick={() => void handleSaveAccount()} disabled={savingAccount}>
            {savingAccount ? "Сохранение…" : `${UI.save} профиль`}
          </Button>
        </CardContent>
      </Card>

      {canManageClinic && (
        <>
          <PanelErrorBoundary title="Блок 152-ФЗ временно недоступен">
            <ComplianceSettingsPanel />
          </PanelErrorBoundary>
          <ModuleGate module="egisz">
            <PanelErrorBoundary title="Блок ЕГИСЗ временно недоступен">
              <EgiszSettingsPanel />
            </PanelErrorBoundary>
          </ModuleGate>
        </>
      )}

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
