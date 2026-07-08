"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useClinicStore } from "@/store/useClinicStore";
import {
  DEFAULT_NOTIFICATION_BODY,
  DEFAULT_REMINDER_PRESETS,
} from "@/lib/notifications/client-constants";
import type {
  NotificationChannel,
  NotificationClinicConfig,
  NotificationDeliveryRow,
  NotificationSettings,
  NotificationTemplate,
} from "@/lib/notifications/types";
import {
  NOTIFICATION_CHANNEL_LABELS,
  NOTIFICATION_STATUS_LABELS,
  NOTIFICATION_TEMPLATE_VARIABLES,
} from "@/lib/notifications/types";
import { renderNotificationTemplate, validateTemplateVariables } from "@/lib/notifications/template-service";

type TabId = "settings" | "templates" | "log" | "test";

interface ProviderStatus {
  configured: boolean;
}

const CHANNELS: NotificationChannel[] = [
  "mock",
  "telegram",
  "whatsapp",
  "sms",
  "email",
  "vk",
  "max",
];

export function NotificationsPanel() {
  const { patients, appointments } = useClinicStore();
  const [tab, setTab] = useState<TabId>("settings");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<NotificationClinicConfig | null>(null);
  const [providers, setProviders] = useState<Record<string, ProviderStatus>>({});
  const [logs, setLogs] = useState<NotificationDeliveryRow[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<NotificationTemplate | null>(null);
  const [testPatientId, setTestPatientId] = useState("");
  const [testAppointmentId, setTestAppointmentId] = useState("");
  const [testChannel, setTestChannel] = useState<NotificationChannel>("mock");
  const [testLoading, setTestLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, logsRes] = await Promise.all([
        fetch("/api/notifications/settings", { credentials: "same-origin" }),
        fetch("/api/notifications/logs?limit=50", { credentials: "same-origin" }),
      ]);
      const settingsData = await settingsRes.json().catch(() => ({}));
      const logsData = await logsRes.json().catch(() => ({}));
      if (!settingsRes.ok) {
        toast.error(settingsData.error ?? "Не удалось загрузить настройки");
        return;
      }
      setConfig(settingsData.config);
      setProviders(settingsData.providers ?? {});
      if (logsRes.ok) setLogs(logsData.logs ?? []);
    } catch {
      toast.error("Ошибка загрузки модуля уведомлений");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveConfig = async (next: NotificationClinicConfig) => {
    setSaving(true);
    try {
      const res = await fetch("/api/notifications/settings", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Не удалось сохранить");
        return;
      }
      setConfig(data.config);
      toast.success("Настройки сохранены");
    } finally {
      setSaving(false);
    }
  };

  const updateSettings = (patch: Partial<NotificationSettings>) => {
    if (!config) return;
    setConfig({ ...config, settings: { ...config.settings, ...patch } });
  };

  const toggleChannel = (ch: NotificationChannel) => {
    if (!config) return;
    const set = new Set(config.settings.enabledChannels);
    if (set.has(ch)) set.delete(ch);
    else set.add(ch);
    updateSettings({ enabledChannels: Array.from(set) });
  };

  const toggleOffset = (minutes: number) => {
    if (!config) return;
    const set = new Set(config.settings.reminderOffsetsMinutes);
    if (set.has(minutes)) set.delete(minutes);
    else set.add(minutes);
    updateSettings({
      reminderOffsetsMinutes: Array.from(set).sort((a, b) => b - a),
    });
  };

  const previewBody = useMemo(() => {
    if (!editingTemplate) return "";
    return renderNotificationTemplate(editingTemplate.body, {
      patientName: "Иван Иванов",
      appointmentDate: "15 июля 2026",
      appointmentTime: "10:30",
      doctorName: "Петров П.П.",
      cabinetName: "Кабинет 1",
      clinicName: config?.settings.clinicName ?? "Клиника",
      clinicPhone: config?.settings.clinicPhone ?? "+7 …",
      clinicAddress: config?.settings.clinicAddress ?? "ул. Примерная, 1",
    });
  }, [editingTemplate, config]);

  const saveTemplate = async () => {
    if (!editingTemplate) return;
    const unknown = validateTemplateVariables(editingTemplate.body);
    if (unknown.length) {
      toast.error(`Неизвестные переменные: ${unknown.join(", ")}`);
      return;
    }
    const isNew = !config?.templates.some((t) => t.id === editingTemplate.id);
    const res = await fetch(
      isNew ? "/api/notifications/templates" : `/api/notifications/templates/${editingTemplate.id}`,
      {
        method: isNew ? "POST" : "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingTemplate),
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? "Не удалось сохранить шаблон");
      return;
    }
    toast.success("Шаблон сохранён");
    setEditingTemplate(null);
    await load();
  };

  const runCheck = async () => {
    const res = await fetch("/api/notifications/run-check", {
      method: "POST",
      credentials: "same-origin",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? "Ошибка");
      return;
    }
    toast.success(
      `Запланировано: ${data.scheduled?.scheduled ?? 0}, обработано: ${data.processed?.processed ?? 0}`
    );
    await load();
  };

  const sendTest = async () => {
    if (!testPatientId || !testAppointmentId) {
      toast.error("Выберите пациента и запись");
      return;
    }
    setTestLoading(true);
    try {
      const res = await fetch("/api/notifications/test", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: testPatientId,
          appointmentId: testAppointmentId,
          channel: testChannel,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? "Тест не удался");
        return;
      }
      toast.success("Тестовое уведомление отправлено (mock или настроенный канал)");
      await load();
    } finally {
      setTestLoading(false);
    }
  };

  const retryLog = async (id: string) => {
    const res = await fetch(`/api/notifications/logs/${id}/retry`, {
      method: "POST",
      credentials: "same-origin",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      toast.error(data.error ?? "Повтор не удался");
      return;
    }
    toast.success("Повторная отправка выполнена");
    await load();
  };

  if (loading || !config) {
    return <p className="text-sm text-[var(--muted)]">Загрузка…</p>;
  }

  const upcomingAppointments = appointments.filter(
    (a) => a.status === "scheduled" || a.status === "confirmed"
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 border-b border-[var(--border)] pb-2">
        {(
          [
            ["settings", "Настройки"],
            ["templates", "Шаблоны"],
            ["log", "Журнал"],
            ["test", "Тестирование"],
          ] as const
        ).map(([id, label]) => (
          <Button
            key={id}
            type="button"
            variant={tab === id ? "default" : "outline"}
            size="sm"
            onClick={() => setTab(id)}
          >
            {label}
          </Button>
        ))}
      </div>

      {tab === "settings" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Настройки отправки</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={config.settings.enabled}
                onChange={(e) => updateSettings({ enabled: e.target.checked })}
              />
              Включить автоматические уведомления о записи
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={config.settings.testMode}
                onChange={(e) => updateSettings({ testMode: e.target.checked })}
              />
              Тестовый режим (всегда mock, без реальных SMS/WhatsApp)
            </label>

            <div>
              <p className="mb-2 text-sm font-medium">Каналы</p>
              <div className="flex flex-wrap gap-2">
                {CHANNELS.filter((c) => c !== "mock").map((ch) => (
                  <label key={ch} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={config.settings.enabledChannels.includes(ch)}
                      onChange={() => toggleChannel(ch)}
                    />
                    {NOTIFICATION_CHANNEL_LABELS[ch]}
                    {!providers[ch]?.configured && (
                      <span className="text-xs text-amber-600">(не настроен на сервере)</span>
                    )}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">Время напоминания (до приёма)</p>
              <div className="flex flex-wrap gap-2">
                {DEFAULT_REMINDER_PRESETS.map(({ minutes, label }) => (
                  <label key={minutes} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={config.settings.reminderOffsetsMinutes.includes(minutes)}
                      onChange={() => toggleOffset(minutes)}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Label className="text-xs">Своё (минуты):</Label>
                <Input
                  className="h-8 w-24"
                  placeholder="120"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const v = Number((e.target as HTMLInputElement).value);
                      if (v > 0) toggleOffset(v);
                    }
                  }}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Название клиники в сообщениях</Label>
                <Input
                  value={config.settings.clinicName}
                  onChange={(e) => updateSettings({ clinicName: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Телефон клиники</Label>
                <Input
                  value={config.settings.clinicPhone}
                  onChange={(e) => updateSettings({ clinicPhone: e.target.value })}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Адрес</Label>
                <Input
                  value={config.settings.clinicAddress}
                  onChange={(e) => updateSettings({ clinicAddress: e.target.value })}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={config.settings.retryEnabled}
                onChange={(e) => updateSettings({ retryEnabled: e.target.checked })}
              />
              Повторять при ошибке ({config.settings.retryCount} раз, каждые{" "}
              {config.settings.retryDelayMinutes} мин)
            </label>

            <div className="flex flex-wrap gap-2">
              <Button disabled={saving} onClick={() => void saveConfig(config)}>
                {saving ? "Сохранение…" : "Сохранить настройки"}
              </Button>
              <Button variant="outline" onClick={() => void runCheck()}>
                Проверить записи сейчас
              </Button>
            </div>

            <p className="text-xs text-[var(--muted)]">
              Пациент получает уведомления только при согласии в карточке (notificationPrefs).
              Текст нейтральный — без диагнозов и мед. данных (152-ФЗ).
            </p>
          </CardContent>
        </Card>
      )}

      {tab === "templates" && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Шаблоны сообщений</CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setEditingTemplate({
                    id: `tpl-${Date.now()}`,
                    name: "Новый шаблон",
                    channel: "any",
                    eventType: "appointment_reminder",
                    body: DEFAULT_NOTIFICATION_BODY,
                    isDefault: false,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                  })
                }
              >
                Добавить
              </Button>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {config.templates.map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                  >
                    <span>
                      {t.name}{" "}
                      <span className="text-[var(--muted)]">
                        ({t.channel === "any" ? "все каналы" : NOTIFICATION_CHANNEL_LABELS[t.channel as NotificationChannel]})
                      </span>
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => setEditingTemplate({ ...t })}>
                      Редактировать
                    </Button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {editingTemplate && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Редактор шаблона</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  value={editingTemplate.name}
                  onChange={(e) =>
                    setEditingTemplate({ ...editingTemplate, name: e.target.value })
                  }
                  placeholder="Название"
                />
                <textarea
                  className="min-h-[120px] w-full rounded-md border border-[var(--border)] bg-[var(--background)] p-3 text-sm"
                  value={editingTemplate.body}
                  onChange={(e) =>
                    setEditingTemplate({ ...editingTemplate, body: e.target.value })
                  }
                />
                <p className="text-xs text-[var(--muted)]">
                  Переменные:{" "}
                  {NOTIFICATION_TEMPLATE_VARIABLES.map((v) => `{{${v.key}}}`).join(", ")}
                </p>
                <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-900">
                  <p className="text-xs font-medium text-[var(--muted)]">Предпросмотр</p>
                  <p className="mt-1 whitespace-pre-wrap">{previewBody}</p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => void saveTemplate()}>Сохранить шаблон</Button>
                  <Button variant="outline" onClick={() => setEditingTemplate(null)}>
                    Отмена
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {tab === "log" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Журнал отправок</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b text-left text-[var(--muted)]">
                  <th className="py-2 pr-3">Когда</th>
                  <th className="py-2 pr-3">Пациент</th>
                  <th className="py-2 pr-3">Канал</th>
                  <th className="py-2 pr-3">Статус</th>
                  <th className="py-2 pr-3">Ошибка</th>
                  <th className="py-2"> </th>
                </tr>
              </thead>
              <tbody>
                {logs.map((row) => {
                  const patient = patients.find((p) => p.id === row.patientId);
                  return (
                    <tr key={row.id} className="border-b border-[var(--border)]">
                      <td className="py-2 pr-3">
                        {new Date(row.scheduledAt).toLocaleString("ru-RU")}
                      </td>
                      <td className="py-2 pr-3">
                        {patient
                          ? `${patient.lastName} ${patient.firstName}`
                          : row.patientId.slice(0, 8)}
                      </td>
                      <td className="py-2 pr-3">{NOTIFICATION_CHANNEL_LABELS[row.channel]}</td>
                      <td className="py-2 pr-3">{NOTIFICATION_STATUS_LABELS[row.status]}</td>
                      <td className="py-2 pr-3 max-w-[200px] truncate">{row.errorMessage ?? "—"}</td>
                      <td className="py-2">
                        {row.status === "failed" && (
                          <Button size="sm" variant="ghost" onClick={() => void retryLog(row.id)}>
                            Повторить
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {logs.length === 0 && (
              <p className="py-4 text-center text-sm text-[var(--muted)]">Отправок пока нет</p>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "test" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Тестовая отправка</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Пациент</Label>
                <select
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                  value={testPatientId}
                  onChange={(e) => setTestPatientId(e.target.value)}
                >
                  <option value="">— выберите —</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.lastName} {p.firstName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Запись</Label>
                <select
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                  value={testAppointmentId}
                  onChange={(e) => setTestAppointmentId(e.target.value)}
                >
                  <option value="">— выберите —</option>
                  {upcomingAppointments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.date} {a.startTime}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Канал</Label>
                <select
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                  value={testChannel}
                  onChange={(e) => setTestChannel(e.target.value as NotificationChannel)}
                >
                  {CHANNELS.map((ch) => (
                    <option key={ch} value={ch}>
                      {NOTIFICATION_CHANNEL_LABELS[ch]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <Button disabled={testLoading} onClick={() => void sendTest()}>
              {testLoading ? "Отправка…" : "Отправить тест"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
