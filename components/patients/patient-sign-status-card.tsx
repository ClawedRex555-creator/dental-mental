"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface SignRequestRow {
  id: string;
  status: string;
  provider?: string;
  signatureStatus?: string;
  signatureMethod?: string;
  signedAt?: string;
  signPackageId?: string;
  signOperationId?: string;
  externalId?: string;
  documentRefs?: Array<{ name: string }>;
  createdAt: string;
}

interface SmsTaskRow {
  status: string;
  statusLabel: string;
  manualSendConfirmedAt?: string;
}

export function PatientSignStatusCard({ patientId }: { patientId: string }) {
  const [rows, setRows] = useState<SignRequestRow[]>([]);
  const [taskByPackage, setTaskByPackage] = useState<Record<string, SmsTaskRow>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(
      `/api/document-sign/requests?patientId=${encodeURIComponent(patientId)}`,
      { credentials: "same-origin" }
    );
    if (!res.ok) {
      setLoaded(true);
      return;
    }
    const data = (await res.json()) as { requests?: SignRequestRow[] };
    const signRows = (data.requests ?? [])
      .filter((x) => x.provider === "emkaro_sign" || !x.provider)
      .slice(0, 8);
    setRows(signRows);

    const next: Record<string, SmsTaskRow> = {};
    await Promise.all(
      signRows.map(async (r) => {
        const pkg = r.externalId ?? r.signPackageId;
        if (!pkg || r.status === "signed" || r.status === "cancelled") return;
        const tr = await fetch(
          `/api/clinic/sign-sender/tasks?packageId=${encodeURIComponent(pkg)}`,
          { credentials: "same-origin" }
        );
        if (!tr.ok) return;
        const td = (await tr.json()) as { task?: SmsTaskRow | null };
        if (td.task) next[pkg] = td.task;
      })
    );
    setTaskByPackage(next);
    setLoaded(true);
  }, [patientId]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 8000);
    return () => window.clearInterval(id);
  }, [load]);

  const cancel = async (row: SignRequestRow) => {
    setBusyId(row.id);
    try {
      const res = await fetch("/api/document-sign/cancel", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: row.id }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Не удалось отменить");
        return;
      }
      toast.success("Пакет отменён");
      await load();
    } finally {
      setBusyId(null);
    }
  };

  if (!loaded) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Подпись Emkaro Sign</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            Пока нет пакетов на подпись. После отправки из «Пациент пришёл» и подписания
            пациентом статус появится здесь. Полный журнал — в Emkaro Sign → «Журнал».
          </p>
        ) : (
          rows.map((r) => {
            const signed = r.status === "signed" || r.signatureStatus === "SIGNED";
            const cancelled = r.status === "cancelled";
            const titles = (r.documentRefs ?? []).map((d) => d.name).join(", ") || "Пакет";
            const pkg = r.externalId ?? r.signPackageId;
            const smsTask = pkg ? taskByPackage[pkg] : undefined;
            const canCancel = !signed && !cancelled && r.status === "pending";

            return (
              <div key={r.id} className="rounded-lg border border-[var(--border)] p-3 text-sm">
                <p className="font-medium">{titles}</p>
                <p className="mt-1 text-[var(--muted)]">
                  {signed
                    ? "☑ Подписан ПЭП"
                    : cancelled
                      ? "Отменён"
                      : `Статус: ${r.signatureStatus ?? r.status}`}
                </p>
                {smsTask && !signed && !cancelled && (
                  <p className="text-xs text-teal-700 dark:text-teal-400">
                    SMS: {smsTask.statusLabel}
                  </p>
                )}
                {signed && (
                  <p className="text-xs text-[var(--muted)]">
                    Дата:{" "}
                    {r.signedAt ? new Date(r.signedAt).toLocaleString("ru-RU") : "—"} · Метод:{" "}
                    {r.signatureMethod ?? "Emkaro Sign"}
                    {pkg ? ` · Package: ${r.signOperationId ?? pkg}` : ""}
                  </p>
                )}
                {canCancel && (
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-2"
                    disabled={busyId === r.id}
                    onClick={() => void cancel(r)}
                  >
                    {busyId === r.id ? "Отмена…" : "Отменить пакет"}
                  </Button>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
