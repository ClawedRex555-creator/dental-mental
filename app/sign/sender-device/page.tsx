"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const TOKEN_KEY = "emkaro_sign_sender_device_token";

type TaskView = {
  id: string;
  patientDisplayName: string;
  recipientPhoneMasked: string;
  documentCount: number;
  status: string;
  expiresAt: string;
};

export default function SignSenderDevicePage() {
  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [declaredPhone, setDeclaredPhone] = useState("");
  const [displayName, setDisplayName] = useState("Телефон клиники");
  const [tasks, setTasks] = useState<TaskView[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmTaskId, setConfirmTaskId] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved) setDeviceToken(saved);
    const params = new URLSearchParams(window.location.search);
    const q = params.get("code");
    if (q) setCode(q);
  }, []);

  const paired = Boolean(deviceToken);

  const poll = useCallback(async () => {
    if (!deviceToken) return;
    const res = await fetch("/api/sign/sender-device/tasks", {
      headers: { "X-Emkaro-Device-Token": deviceToken },
    });
    if (res.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      setDeviceToken(null);
      return;
    }
    if (!res.ok) return;
    const data = (await res.json()) as { tasks?: TaskView[] };
    setTasks(data.tasks ?? []);
  }, [deviceToken]);

  useEffect(() => {
    if (!deviceToken) return;
    void poll();
    const id = window.setInterval(() => void poll(), 5000);
    return () => window.clearInterval(id);
  }, [deviceToken, poll]);

  const pair = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/sign/sender-device/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shortCode: code.trim(),
          displayName,
          declaredPhoneNumber: declaredPhone.trim() || undefined,
          deviceName: navigator.userAgent.slice(0, 120),
          platform: /iPhone|iPad|iOS/i.test(navigator.userAgent)
            ? "ios"
            : /Android/i.test(navigator.userAgent)
              ? "android"
              : "web",
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        deviceToken?: string;
      };
      if (!res.ok || !data.deviceToken) {
        toast.error(data.error ?? "Не удалось привязать");
        return;
      }
      localStorage.setItem(TOKEN_KEY, data.deviceToken);
      setDeviceToken(data.deviceToken);
      toast.success("Устройство привязано");
    } finally {
      setBusy(false);
    }
  };

  const openSms = async (taskId: string) => {
    if (!deviceToken) return;
    setBusy(true);
    try {
      const res = await fetch("/api/sign/sender-device/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Emkaro-Device-Token": deviceToken,
        },
        body: JSON.stringify({ taskId, action: "open_composer" }),
      });
      const data = (await res.json()) as {
        error?: string;
        smsUri?: string;
      };
      if (!res.ok || !data.smsUri) {
        toast.error(data.error ?? "Не удалось открыть SMS");
        return;
      }
      window.location.href = data.smsUri;
      setConfirmTaskId(taskId);
    } finally {
      setBusy(false);
    }
  };

  const confirmSent = async (yes: boolean) => {
    if (!deviceToken || !confirmTaskId) return;
    if (!yes) {
      setConfirmTaskId(null);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/sign/sender-device/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Emkaro-Device-Token": deviceToken,
        },
        body: JSON.stringify({ taskId: confirmTaskId, action: "confirm_sent" }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Ошибка подтверждения");
        return;
      }
      toast.success("Отправка подтверждена");
      setConfirmTaskId(null);
      await poll();
    } finally {
      setBusy(false);
    }
  };

  const title = useMemo(
    () => (paired ? "Emkaro Sign — отправка SMS" : "Привязка телефона клиники"),
    [paired]
  );

  return (
    <main className="mx-auto min-h-dvh max-w-md bg-slate-50 px-4 py-8 text-slate-900">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-slate-600">
        {paired
          ? "Сотрудник сам нажимает «Отправить» в стандартном приложении SMS. Emkaro не шлёт SMS автоматически."
          : "Вход в МИС не нужен. Введите 6-значный код с компьютера клиники и нажмите «Привязать»."}
      </p>

      {!paired ? (
        <div className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <div>
            <Label>Код с компьютера (6 цифр)</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              placeholder="123456"
              className="mt-1"
            />
          </div>
          <div>
            <Label>Название устройства</Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Номер отправителя, заявленный клиникой</Label>
            <Input
              value={declaredPhone}
              onChange={(e) => setDeclaredPhone(e.target.value)}
              placeholder="+7…"
              className="mt-1"
            />
            <p className="mt-1 text-xs text-slate-500">
              Браузер не подтверждает SIM — это заявленный номер клиники.
            </p>
          </div>
          <Button className="w-full" disabled={busy || code.length !== 6} onClick={() => void pair()}>
            Привязать устройство
          </Button>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {tasks.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
              Нет задач на отправку. Ожидание…
            </p>
          ) : (
            tasks.map((t) => (
              <div
                key={t.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <p className="text-xs uppercase tracking-wide text-slate-500">Emkaro Sign</p>
                <p className="mt-1 font-medium">Пациент: {t.patientDisplayName}</p>
                <p className="text-sm text-slate-600">Телефон: {t.recipientPhoneMasked}</p>
                <p className="text-sm text-slate-600">Документов: {t.documentCount}</p>
                <Button
                  className="mt-3 w-full"
                  disabled={busy}
                  onClick={() => void openSms(t.id)}
                >
                  Открыть SMS
                </Button>
              </div>
            ))
          )}

          {confirmTaskId && (
            <div className="fixed inset-0 z-50 flex items-end bg-black/40 p-4 sm:items-center sm:justify-center">
              <div className="w-full max-w-sm rounded-xl bg-white p-4">
                <p className="font-medium">Вы отправили сообщение пациенту?</p>
                <p className="mt-1 text-sm text-slate-600">
                  Подтверждение только о действии сотрудника, не о доставке оператором.
                </p>
                <div className="mt-4 flex gap-2">
                  <Button className="flex-1" disabled={busy} onClick={() => void confirmSent(true)}>
                    Да, отправлено
                  </Button>
                  <Button
                    className="flex-1"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void confirmSent(false)}
                  >
                    Нет
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
