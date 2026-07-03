"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  DEFAULT_N3_TEST_GATEWAY,
  EGISZ_DOCUMENT_LABELS,
  EGISZ_STATUS_LABELS,
  type EgiszClinicConfig,
  type EgiszConnectionMode,
} from "@/lib/egisz/types";

interface SubmissionRow {
  id: string;
  patientId: string;
  medicalRecordId?: string;
  documentType: keyof typeof EGISZ_DOCUMENT_LABELS;
  status: keyof typeof EGISZ_STATUS_LABELS;
  createdAt: string;
  externalId?: string;
  errorMessage?: string;
}

interface StatusInfo {
  n3StubMode?: boolean;
  connectionMode?: EgiszConnectionMode;
  signingMode?: string;
  gatewayUrl?: string;
  missingForLive?: string[];
  message?: string;
}

interface ClinicInfo {
  name: string;
  inn: string;
}

type ClientConfig = EgiszClinicConfig & { n3PasswordSet?: boolean };

export function EgiszSettingsPanel() {
  const [config, setConfig] = useState<ClientConfig>({
    enabled: false,
    connectionMode: "stub",
    environment: "test",
    autoSubmitSemd: false,
    documentOid: "1.2.643.5.1.13.13.14.1.9.1.181",
    signing: { mode: "stub" },
    n3: {},
  });
  const [clinic, setClinic] = useState<ClinicInfo>({ name: "", inn: "" });
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [status, setStatus] = useState<StatusInfo>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);

  const load = async () => {
    try {
      const [cfgRes, stRes] = await Promise.all([
        fetch("/api/egisz/config", { credentials: "same-origin" }),
        fetch("/api/egisz/status", { credentials: "same-origin" }),
      ]);
      if (cfgRes.ok) {
        const data = await cfgRes.json();
        setConfig(data.config ?? config);
        setSubmissions(data.submissions ?? []);
        setClinic(data.clinic ?? { name: "", inn: "" });
      }
      if (stRes.ok) setStatus(await stRes.json());
    } catch {
      toast.error("Не удалось загрузить настройки ЕГИСЗ");
    }
  };

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const { n3PasswordSet: _omit, ...payload } = config;
      const res = await fetch("/api/egisz/config", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? `Не удалось сохранить (HTTP ${res.status})`);
        return;
      }
      toast.success("Настройки N3 / ЕГИСЗ сохранены");
      await load();
    } catch {
      toast.error("Ошибка сети при сохранении настроек ЕГИСЗ");
    } finally {
      setSaving(false);
    }
  };

  const processSubmissions = async (items: SubmissionRow[], retry: boolean) => {
    if (items.length === 0) return;
    const batch = items.slice(0, 5);
    for (const s of batch) {
      const res = await fetch("/api/egisz/submit", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: s.id, process: true, retry }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Ошибка обработки очереди");
        await load();
        return;
      }
    }
    const cfgRes = await fetch("/api/egisz/config", { credentials: "same-origin" });
    const data = cfgRes.ok ? await cfgRes.json() : {};
    const fresh: SubmissionRow[] = data.submissions ?? [];
    setSubmissions(fresh);
    if (cfgRes.ok && data.config) setConfig(data.config);

    const batchIds = new Set(batch.map((s) => s.id));
    const processed = fresh.filter((s) => batchIds.has(s.id));
    const sent = processed.filter((s) => s.status === "sent" || s.status === "accepted");
    const failed = processed.filter((s) => s.status === "error");

    const describeError = (msg?: string) => {
      if (!msg?.trim()) return "см. список «Отправки» ниже";
      if (/^(СНИЛС|OID|Отпечаток|Врач|Медкарта|Пациент|Live N3|Нет согласия)/i.test(msg)) {
        return `не хватало данных: ${msg}`;
      }
      return msg;
    };

    if (sent.length > 0 && failed.length === 0) {
      toast.success(`Отправлено: ${sent.length}. Статус — в списке «Отправки» ниже.`);
    } else if (sent.length > 0 && failed.length > 0) {
      toast.warning(
        `Отправлено: ${sent.length}, не отправлено: ${failed.length} (${describeError(failed[0]?.errorMessage)})`
      );
    } else if (failed.length > 0) {
      toast.error(`Не отправлено: ${describeError(failed[0]?.errorMessage)}`);
    } else {
      toast.message(`Обработано записей: ${processed.length}. Смотрите статус в списке «Отправки» ниже.`);
    }
  };

  const processQueue = async () => {
    setProcessing(true);
    try {
      const queued = submissions.filter((s) => s.status === "queued");
      if (queued.length === 0) {
        toast.message("В очереди нет записей", {
          description:
            "Сохраните медкарту с диагнозом (включите «Автоматически ставить СЭМД в очередь») или отправьте вручную из медкарты.",
        });
        return;
      }
      await processSubmissions(queued, false);
    } finally {
      setProcessing(false);
    }
  };

  const retryErrors = async () => {
    setProcessing(true);
    try {
      const errors = submissions.filter((s) => s.status === "error");
      if (errors.length === 0) {
        toast.message("Нет отправок со статусом «Ошибка»");
        return;
      }
      await processSubmissions(errors, true);
    } finally {
      setProcessing(false);
    }
  };

  const retryOne = async (id: string) => {
    setProcessing(true);
    try {
      const row = submissions.find((s) => s.id === id);
      if (!row) return;
      await processSubmissions([row], true);
    } finally {
      setProcessing(false);
    }
  };

  const setN3 = (patch: Partial<NonNullable<EgiszClinicConfig["n3"]>>) =>
    setConfig((c) => ({ ...c, n3: { ...c.n3, ...patch } }));

  const setSigning = (patch: Partial<NonNullable<EgiszClinicConfig["signing"]>>) =>
    setConfig((c) => ({
      ...c,
      signing: { mode: "stub", ...c.signing, ...patch },
    }));

  if (loading) {
    return <p className="text-sm text-[var(--muted)]">Загрузка настроек ЕГИСЗ…</p>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Интеграция N3.Health ИЭМК (ЕГИСЗ)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className="rounded-lg border px-3 py-2 text-sm"
          style={{
            borderColor: "var(--callout-info-border)",
            backgroundColor: "var(--callout-info-bg)",
          }}
        >
          <p className="font-medium" style={{ color: "var(--callout-info-title)" }}>
            {clinic.name || "Клиника"}
            {clinic.inn ? ` · ИНН ${clinic.inn}` : " · укажите ИНН в общих настройках"}
          </p>
        </div>

        {status.message && (
          <div
            className="rounded-lg border px-3 py-2 text-sm"
            style={{
              borderColor: "var(--border)",
              backgroundColor: "var(--callout-neutral-bg)",
              color: "var(--foreground)",
            }}
          >
            {status.message}
            {status.n3StubMode && (
              <span className="mt-1 block" style={{ color: "var(--callout-stub-text)" }}>
                Режим stub — без реального SOAP для этой клиники
              </span>
            )}
            {!status.n3StubMode && (
              <span className="mt-1 block" style={{ color: "var(--callout-success-text)" }}>
                Live — отправка в N3 от имени этой медицинской организации
              </span>
            )}
          </div>
        )}

        {status.missingForLive && status.missingForLive.length > 0 && config.connectionMode === "live" && (
          <p
            className="rounded-lg border px-3 py-2 text-xs"
            style={{
              borderColor: "var(--callout-warn-border)",
              backgroundColor: "var(--callout-warn-bg)",
              color: "var(--callout-warn-text)",
            }}
          >
            Для live не хватает: {status.missingForLive.join(", ")}
          </p>
        )}

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => setConfig((c) => ({ ...c, enabled: e.target.checked }))}
          />
          Включить интеграцию с ЕГИСЗ
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Подключение к N3</Label>
            <select
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              value={config.connectionMode ?? "stub"}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  connectionMode: e.target.value === "live" ? "live" : "stub",
                }))
              }
            >
              <option value="stub">Stub — тест CDA/очереди без SOAP</option>
              <option value="live">Live — реальный N3 этой клиники</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>Контур N3</Label>
            <select
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              value={config.environment}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  environment: e.target.value === "production" ? "production" : "test",
                }))
              }
            >
              <option value="test">Тестовый (N3 demo)</option>
              <option value="production">Промышленный</option>
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>OID организации (ЕГИСЗ)</Label>
            <Input
              value={config.organizationOid ?? ""}
              onChange={(e) => setConfig((c) => ({ ...c, organizationOid: e.target.value }))}
              placeholder="OID вашего юр. лица"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>OID типа CDA-документа</Label>
            <Input
              value={config.documentOid ?? ""}
              onChange={(e) => setConfig((c) => ({ ...c, documentOid: e.target.value }))}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>URL SOAP N3</Label>
            <Input
              value={config.gatewayUrl ?? ""}
              onChange={(e) => setConfig((c) => ({ ...c, gatewayUrl: e.target.value }))}
              placeholder={DEFAULT_N3_TEST_GATEWAY}
            />
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border)] p-3 space-y-3">
          <p className="text-sm font-medium">Учётные данные N3 этой клиники</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>GUID МО</Label>
              <Input value={config.n3?.guid ?? ""} onChange={(e) => setN3({ guid: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>idLPU</Label>
              <Input value={config.n3?.lpuId ?? ""} onChange={(e) => setN3({ lpuId: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Login N3</Label>
              <Input value={config.n3?.login ?? ""} onChange={(e) => setN3({ login: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Password N3</Label>
              <Input
                type="password"
                value={config.n3?.password ?? ""}
                onChange={(e) => setN3({ password: e.target.value })}
                placeholder={config.n3PasswordSet ? "Оставьте •••••••• чтобы не менять" : ""}
                autoComplete="off"
              />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border)] p-3 space-y-3">
          <p className="text-sm font-medium">Подпись CDA (КЭП организации)</p>
          <div className="space-y-2">
            <Label>Режим</Label>
            <select
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              value={config.signing?.mode ?? "stub"}
              onChange={(e) =>
                setSigning({ mode: e.target.value === "cryptopro" ? "cryptopro" : "stub" })
              }
            >
              <option value="stub">Stub (тест N3 без CryptoPro)</option>
              <option value="cryptopro">CryptoPro (тестовый / боевой контур N3)</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>Отпечаток КЭП организации</Label>
            <Input
              value={config.signing?.orgCertThumbprint ?? ""}
              onChange={(e) => setSigning({ orgCertThumbprint: e.target.value })}
              className="font-mono text-xs"
              placeholder="Один на всю клинику (юр. лицо)"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={config.autoSubmitSemd}
            onChange={(e) => setConfig((c) => ({ ...c, autoSubmitSemd: e.target.checked }))}
          />
          Автоматически ставить СЭМД в очередь при сохранении медкарты
        </label>

        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={saving}>
            {saving ? "Сохранение…" : "Сохранить"}
          </Button>
          <Button variant="outline" onClick={() => void processQueue()} disabled={processing}>
            {processing ? "Обработка…" : "Обработать очередь"}
          </Button>
          {submissions.some((s) => s.status === "error") ? (
            <Button variant="outline" onClick={() => void retryErrors()} disabled={processing}>
              Повторить ошибки
            </Button>
          ) : null}
        </div>

        {submissions.length > 0 ? (
          <div className="border-t border-[var(--border)] pt-4">
            <h3 className="mb-2 text-sm font-medium">Отправки этой клиники</h3>
            <ul className="space-y-1 text-xs text-[var(--muted)]">
              {submissions.slice(0, 15).map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2">
                  <span>
                    {EGISZ_DOCUMENT_LABELS[s.documentType]} — {EGISZ_STATUS_LABELS[s.status]}{" "}
                    ({new Date(s.createdAt).toLocaleString("ru-RU")})
                    {s.externalId ? ` · ${s.externalId}` : ""}
                    {s.errorMessage ? ` — ${s.errorMessage}` : ""}
                  </span>
                  {s.status === "error" ? (
                    <button
                      type="button"
                      className="text-[var(--primary)] underline-offset-2 hover:underline disabled:opacity-50"
                      disabled={processing}
                      onClick={() => void retryOne(s.id)}
                    >
                      Повторить
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="border-t border-[var(--border)] pt-4 text-xs text-[var(--muted)]">
            Отправок пока нет.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
