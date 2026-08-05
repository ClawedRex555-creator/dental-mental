"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface WebhookUrls {
  booking: string;
  cancel: string;
  status: string;
  update: string;
  health: string;
}

interface ClientConfig {
  enabled: boolean;
  apiBaseUrl?: string;
  filialId?: string;
  filialName?: string;
  scheduleDays?: number;
  pushServices?: boolean;
  apiTokenSet?: boolean;
  inboundTokenSet?: boolean;
  lastSchedulePushAt?: string;
  lastSchedulePushError?: string;
  lastServicesPushAt?: string;
  lastServicesPushError?: string;
}

export function MedflexSettingsPanel() {
  const [config, setConfig] = useState<ClientConfig>({
    enabled: false,
    apiBaseUrl: "https://mis-api.medflex.ru",
    scheduleDays: 30,
    pushServices: true,
  });
  const [apiToken, setApiToken] = useState("");
  const [webhookUrls, setWebhookUrls] = useState<WebhookUrls | null>(null);
  const [inboundToken, setInboundToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const res = await fetch("/api/medflex/config", { credentials: "same-origin" });
    if (!res.ok) {
      toast.error("Не удалось загрузить MedFlex");
      return;
    }
    const data = await res.json();
    setConfig(data.config ?? config);
    setWebhookUrls(data.webhookUrls ?? null);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void load().finally(() => setLoading(false));
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (extra?: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await fetch("/api/medflex/config", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: config.enabled,
          apiBaseUrl: config.apiBaseUrl,
          filialId: config.filialId,
          filialName: config.filialName,
          scheduleDays: config.scheduleDays,
          pushServices: config.pushServices,
          apiToken: apiToken.trim() || undefined,
          ...extra,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Ошибка сохранения");
        return;
      }
      setConfig(data.config ?? config);
      setApiToken("");
      toast.success("Настройки MedFlex сохранены");
      await load();
    } finally {
      setSaving(false);
    }
  };

  const push = async (action: "push_schedule" | "push_services") => {
    const res = await fetch("/api/medflex/config", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      toast.error(data.error ?? "Ошибка выгрузки");
      return;
    }
    toast.success(action === "push_schedule" ? "Расписание отправлено" : "Услуги отправлены");
    await load();
  };

  const revealToken = async () => {
    const res = await fetch("/api/medflex/config", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reveal_inbound_token" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error("Не удалось показать токен");
      return;
    }
    setInboundToken(data.inboundToken ?? null);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-slate-500">Загрузка MedFlex…</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>MedFlex / ПроДокторов — онлайн-запись</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => setConfig((c) => ({ ...c, enabled: e.target.checked }))}
          />
          Включить интеграцию
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>API base URL</Label>
            <Input
              value={config.apiBaseUrl ?? ""}
              onChange={(e) => setConfig((c) => ({ ...c, apiBaseUrl: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Токен MedFlex (исходящий)</Label>
            <Input
              type="password"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder={config.apiTokenSet ? "•••• сохранён" : "вставьте Token от менеджера"}
            />
          </div>
          <div className="space-y-2">
            <Label>filial_id</Label>
            <Input
              value={config.filialId ?? ""}
              onChange={(e) => setConfig((c) => ({ ...c, filialId: e.target.value }))}
              placeholder="любой стабильный id"
            />
          </div>
          <div className="space-y-2">
            <Label>Название филиала</Label>
            <Input
              value={config.filialName ?? ""}
              onChange={(e) => setConfig((c) => ({ ...c, filialName: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Дней расписания</Label>
            <Input
              type="number"
              min={1}
              max={90}
              value={config.scheduleDays ?? 30}
              onChange={(e) =>
                setConfig((c) => ({ ...c, scheduleDays: Number(e.target.value) || 30 }))
              }
            />
          </div>
          <label className="flex items-center gap-2 text-sm self-end pb-2">
            <input
              type="checkbox"
              checked={config.pushServices !== false}
              onChange={(e) => setConfig((c) => ({ ...c, pushServices: e.target.checked }))}
            />
            Выгружать услуги отдельно
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={saving} onClick={() => void save()}>
            Сохранить
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => void save({ regenerateInboundToken: true })}
          >
            Новый входящий токен
          </Button>
          <Button type="button" variant="outline" onClick={() => void push("push_schedule")}>
            Выгрузить расписание сейчас
          </Button>
          <Button type="button" variant="outline" onClick={() => void push("push_services")}>
            Выгрузить услуги сейчас
          </Button>
        </div>

        {(config.lastSchedulePushAt || config.lastSchedulePushError) && (
          <p className="text-xs text-slate-500">
            Расписание: {config.lastSchedulePushAt ?? "—"}
            {config.lastSchedulePushError ? ` · ошибка: ${config.lastSchedulePushError}` : ""}
          </p>
        )}

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm space-y-2">
          <p className="font-medium">Отправить менеджеру MedFlex</p>
          <Button type="button" size="sm" variant="outline" onClick={() => void revealToken()}>
            Показать наш входящий токен
          </Button>
          {inboundToken && (
            <p className="font-mono text-xs break-all">Authorization: Token {inboundToken}</p>
          )}
          {webhookUrls && (
            <ul className="space-y-1 font-mono text-xs break-all">
              <li>Запись: {webhookUrls.booking}</li>
              <li>Отмена: {webhookUrls.cancel}</li>
              <li>Статус: {webhookUrls.status}</li>
              <li>Обновление: {webhookUrls.update}</li>
              <li>Health GET: {webhookUrls.health}</li>
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
