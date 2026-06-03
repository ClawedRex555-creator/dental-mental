"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useClinicStore } from "@/store/useClinicStore";

interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

interface AuditRow {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  userName: string | null;
  createdAt: string;
}

export function ComplianceSettingsPanel() {
  const patients = useClinicStore((s) => s.patients);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [patientId, setPatientId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [stRes, logRes] = await Promise.all([
          fetch("/api/compliance", { credentials: "same-origin" }),
          fetch("/api/audit", { credentials: "same-origin" }),
        ]);
        if (stRes.ok) {
          const data = await stRes.json();
          setChecklist(data.checklist ?? []);
        }
        if (logRes.ok) {
          const data = await logRes.json();
          setLogs(data.logs ?? []);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const exportPatient = async () => {
    if (!patientId.trim()) {
      toast.error("Укажите ID пациента");
      return;
    }
    const res = await fetch("/api/compliance", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId: patientId.trim(), action: "export" }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Ошибка экспорта");
      return;
    }
    const blob = new Blob([JSON.stringify(data.export, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `patient-${patientId}-export.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Экспорт данных пациента выполнен");
  };

  const anonymizePatient = async () => {
    if (!patientId.trim()) {
      toast.error("Укажите ID пациента");
      return;
    }
    if (!confirm("Обезличить данные пациента? Действие необратимо.")) return;
    const res = await fetch("/api/compliance", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId: patientId.trim(), action: "anonymize" }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Ошибка");
      return;
    }
    toast.success(data.message || "Готово");
    window.location.reload();
  };

  if (loading) {
    return <p className="text-sm text-[var(--muted)]">Загрузка compliance…</p>;
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>152-ФЗ — защита персональных данных</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-2">
            {checklist.map((item) => (
              <li
                key={item.id}
                className={`flex items-center gap-2 text-sm ${item.done ? "text-green-700" : "text-amber-700"}`}
              >
                <span>{item.done ? "✓" : "○"}</span>
                {item.label}
              </li>
            ))}
          </ul>
          <p className="text-xs text-[var(--muted)]">
            Подробнее: docs/COMPLIANCE-152FZ.md в репозитории. На сервере задайте{" "}
            <code>PHI_ENCRYPTION_KEY</code> и <code>AUTH_SECRET</code>.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Запросы субъекта ПДн</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Пациент</Label>
            <select
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
            >
              <option value="">Выберите пациента</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.lastName} {p.firstName} ({p.id.slice(0, 8)}…)
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportPatient}>
              Экспорт данных (JSON)
            </Button>
            <Button variant="destructive" onClick={anonymizePatient}>
              Обезличить данные
            </Button>
          </div>
        </CardContent>
      </Card>

      {logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Журнал доступа (последние 100)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-64 overflow-auto text-xs">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-[var(--muted)]">
                    <th className="pb-1 pr-2">Время</th>
                    <th className="pb-1 pr-2">Пользователь</th>
                    <th className="pb-1 pr-2">Действие</th>
                    <th className="pb-1">Ресурс</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-t border-[var(--border)]">
                      <td className="py-1 pr-2 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString("ru-RU")}
                      </td>
                      <td className="py-1 pr-2">{log.userName ?? "—"}</td>
                      <td className="py-1 pr-2">{log.action}</td>
                      <td className="py-1">
                        {log.resourceType}
                        {log.resourceId ? ` / ${log.resourceId.slice(0, 8)}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
