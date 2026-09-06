"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
interface DeviceRow {
  id: string;
  displayName: string;
  declaredPhoneNumber?: string;
  deviceName?: string;
  platform?: string;
  pairedAt: string;
  lastSeenAt?: string;
  isPrimary: boolean;
}

export function SignSenderSettingsPanel() {
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [pairing, setPairing] = useState<{
    shortCode: string;
    expiresAt: string;
    pairUrl: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch("/api/clinic/sign-sender/devices", {
      credentials: "same-origin",
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setLoadError(data.error ?? "Не удалось загрузить устройства");
      return;
    }
    setLoadError(null);
    const data = (await res.json()) as { devices?: DeviceRow[] };
    setDevices(data.devices ?? []);
  };

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, []);

  const startPairing = async () => {
    const res = await fetch("/api/clinic/sign-sender/devices", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pair" }),
    });
    const data = (await res.json()) as {
      error?: string;
      shortCode?: string;
      expiresAt?: string;
      pairUrl?: string;
    };
    if (!res.ok || !data.shortCode) {
      toast.error(data.error ?? "Не удалось создать код");
      return;
    }
    setPairing({
      shortCode: data.shortCode,
      expiresAt: data.expiresAt ?? "",
      pairUrl: data.pairUrl ?? "/sign/sender-device",
    });
    toast.success("Код создан — откройте ссылку на телефоне клиники");
  };

  const revoke = async (deviceId: string) => {
    const res = await fetch("/api/clinic/sign-sender/devices", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "revoke", deviceId }),
    });
    if (!res.ok) {
      toast.error("Не удалось отозвать устройство");
      return;
    }
    toast.success("Устройство отозвано");
    await load();
  };

  if (loading) {
    return <p className="text-sm text-[var(--muted)]">Загрузка…</p>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Emkaro Sign — телефон клиники</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-[var(--muted)]">
          SMS пациенту уходит с обычного телефона клиники: сотрудник открывает системное
          приложение SMS и сам нажимает «Отправить». Emkaro не является SMS-провайдером.
        </p>

        {loadError && (
          <p className="text-sm text-red-700">
            {loadError}. Нужны миграция 018 и роль owner/admin.
          </p>
        )}

        <Button type="button" onClick={() => void startPairing()}>
          Добавить устройство
        </Button>

        {pairing && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--callout-neutral-bg)] p-3 text-sm">
            <p>
              Код: <span className="font-mono text-lg font-semibold">{pairing.shortCode}</span>
            </p>
            <p className="mt-1 text-[var(--muted)]">
              На телефоне откройте{" "}
              <a className="text-teal-700 underline" href={pairing.pairUrl}>
                {pairing.pairUrl}
              </a>{" "}
              и введите код (действует до {new Date(pairing.expiresAt).toLocaleTimeString("ru-RU")}).
            </p>
          </div>
        )}

        <div className="space-y-2">
          {devices.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Нет привязанных устройств</p>
          ) : (
            devices.map((d) => (
              <div
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {d.displayName}
                    {d.isPrimary ? " · основной" : ""}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    Заявленный номер: {d.declaredPhoneNumber || "не указан"} · устройство
                    привязано
                    {d.lastSeenAt
                      ? ` · был ${new Date(d.lastSeenAt).toLocaleString("ru-RU")}`
                      : ""}
                  </p>
                </div>
                <Button type="button" variant="outline" onClick={() => void revoke(d.id)}>
                  Отозвать
                </Button>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
