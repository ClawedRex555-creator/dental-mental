"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { LogOut, Shield } from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import {
  CONFIGURABLE_MODULE_IDS,
  MODULE_LABELS,
  isModuleEnabled,
  parseClinicModules,
  type ClinicModules,
  type SystemModuleId,
} from "@/lib/modules";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LegalTemplateGuide } from "@/components/platform/legal-template-guide";
import { EgiszIntegrationGuide } from "@/components/platform/egisz-integration-guide";
import { ClinicWipePanel } from "@/components/platform/clinic-wipe-panel";
import { toast } from "sonner";

interface ClinicRow {
  id: string;
  slug: string;
  name: string;
  modules: ClinicModules;
  egiszEnabled: boolean;
}

interface ClinicEgiszRow {
  clinicId: string;
  slug: string;
  name: string;
  moduleEnabled: boolean;
  integrationEnabled: boolean;
  connectionMode: "stub" | "live";
  organizationOid?: string;
  inn?: string;
  n3Configured: boolean;
  stubMode: boolean;
  queuedCount: number;
  errorCount: number;
  sentCount: number;
}

type ConnectionRequestStatus = "new" | "contacted" | "approved" | "rejected";

interface ConnectionRequestRow {
  id: string;
  createdAt: string;
  clinicName: string;
  contactName: string;
  phone: string;
  email: string;
  desiredSlug: string | null;
  message: string | null;
  status: ConnectionRequestStatus;
  clinicId: string | null;
  ownerUserId: string | null;
  notes: string | null;
  marketingConsent?: boolean;
}

export default function PlatformAdminPage() {
  const [clinics, setClinics] = useState<ClinicRow[]>([]);
  const [egiszClinics, setEgiszClinics] = useState<ClinicEgiszRow[]>([]);
  const [connectionRequests, setConnectionRequests] = useState<ConnectionRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [requestSavingId, setRequestSavingId] = useState<string | null>(null);
  const [requestProvisioningId, setRequestProvisioningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [clinicsRes, egiszRes, requestsRes] = await Promise.all([
        fetch("/api/platform/clinics", { credentials: "same-origin" }),
        fetch("/api/platform/egisz", { credentials: "same-origin" }),
        fetch("/api/platform/connection-requests", { credentials: "same-origin" }),
      ]);
      const clinicsData = await clinicsRes.json().catch(() => ({}));
      const egiszData = await egiszRes.json().catch(() => ({}));
      const requestsData = await requestsRes.json().catch(() => ({}));

      if (!clinicsRes.ok) {
        setLoadError(clinicsData.error || `Ошибка загрузки (${clinicsRes.status})`);
        setClinics([]);
        return;
      }
      setClinics(clinicsData.clinics ?? []);

      if (egiszRes.ok) {
        setEgiszClinics(egiszData.clinics ?? []);
      }
      if (requestsRes.ok) {
        setConnectionRequests(requestsData.requests ?? []);
      } else {
        setConnectionRequests([]);
      }
    } catch {
      setLoadError("Не удалось связаться с сервером");
      setClinics([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateRequestStatus = async (id: string, status: ConnectionRequestStatus) => {
    setRequestSavingId(id);
    try {
      const response = await fetch("/api/platform/connection-requests", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!response.ok) {
        const error = (await response.json().catch(() => ({}))) as { error?: string };
        toast.error(error.error ?? "Не удалось обновить заявку");
        return;
      }
      setConnectionRequests((prev) => prev.map((row) => (row.id === id ? { ...row, status } : row)));
      toast.success("Статус заявки обновлён");
    } catch {
      toast.error("Ошибка сети при обновлении заявки");
    } finally {
      setRequestSavingId(null);
    }
  };

  const provisionClinic = async (requestId: string) => {
    setRequestProvisioningId(requestId);
    try {
      const response = await fetch("/api/platform/connection-requests", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId }),
      });
      const json = (await response.json().catch(() => ({}))) as {
        error?: string;
        clinicSlug?: string;
        ownerEmail?: string;
        tempPassword?: string;
        loginUrl?: string;
      };
      if (!response.ok) {
        toast.error(json.error ?? "Не удалось создать клинику");
        return;
      }
      toast.success("Клиника создана по заявке");
      if (json.ownerEmail && json.tempPassword && json.loginUrl) {
        window.alert(
          `Клиника создана.\n\nЛогин: ${json.ownerEmail}\nВременный пароль: ${json.tempPassword}\nВход: ${json.loginUrl}\n\nСохраните эти данные и передайте клиенту.`
        );
      }
      await load();
    } catch {
      toast.error("Ошибка сети при создании клиники");
    } finally {
      setRequestProvisioningId(null);
    }
  };

  const toggleModule = async (clinic: ClinicRow, moduleId: SystemModuleId) => {
    const next = parseClinicModules({
      ...clinic.modules,
      [moduleId]: !isModuleEnabled(clinic.modules, moduleId),
    });
    setSavingId(clinic.id);
    try {
      const res = await fetch("/api/platform/clinics", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinicId: clinic.id, modules: next }),
      });
      if (!res.ok) {
        toast.error("Не удалось сохранить");
        return;
      }
      setClinics((prev) =>
        prev.map((c) => (c.id === clinic.id ? { ...c, modules: next } : c))
      );
      toast.success(`Модули «${clinic.name}» обновлены`);
      await load();
    } finally {
      setSavingId(null);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    window.location.href = "/platform/login";
  };

  const egiszByClinicId = new Map(egiszClinics.map((row) => [row.clinicId, row]));

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-teal-600" />
            <div>
              <h1 className="font-semibold text-slate-900">{APP_NAME} — супер-админ</h1>
              <p className="text-xs text-slate-500">Управление модулями и сводка ЕГИСЗ</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/">Главная</Link>
            </Button>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="mr-1 h-4 w-4" />
              Выйти
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        {!loading && !loadError && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Заявки на подключение с сайта</CardTitle>
            </CardHeader>
            <CardContent>
              {connectionRequests.length === 0 ? (
                <p className="text-sm text-slate-500">Новых заявок пока нет.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-100 text-left text-slate-600">
                      <tr>
                        <th className="px-3 py-2">Дата</th>
                        <th className="px-3 py-2">Клиника</th>
                        <th className="px-3 py-2">Контакт</th>
                        <th className="px-3 py-2">Статус</th>
                        <th className="px-3 py-2">Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {connectionRequests.map((request) => (
                        <tr key={request.id} className="border-t border-slate-100 align-top">
                          <td className="px-3 py-2 text-slate-500">
                            {new Date(request.createdAt).toLocaleString("ru-RU")}
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-medium text-slate-800">{request.clinicName}</div>
                            {request.desiredSlug && (
                              <div className="font-mono text-teal-700">{request.desiredSlug}</div>
                            )}
                            {request.message && (
                              <p className="mt-1 max-w-[22rem] text-slate-500">{request.message}</p>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div>{request.contactName}</div>
                            <div className="text-slate-500">{request.phone}</div>
                            <div className="text-slate-500">{request.email}</div>
                            {request.marketingConsent ? (
                              <div className="mt-1 text-[11px] text-teal-700">маркетинг: да</div>
                            ) : (
                              <div className="mt-1 text-[11px] text-slate-400">маркетинг: нет</div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium">
                              {request.status}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={requestSavingId === request.id}
                                onClick={() => updateRequestStatus(request.id, "contacted")}
                              >
                                Связались
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={requestSavingId === request.id}
                                onClick={() => updateRequestStatus(request.id, "approved")}
                              >
                                Одобрить
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={requestSavingId === request.id}
                                onClick={() => updateRequestStatus(request.id, "rejected")}
                              >
                                Отклонить
                              </Button>
                              <Button
                                size="sm"
                                disabled={
                                  requestProvisioningId === request.id ||
                                  request.status === "approved" ||
                                  Boolean(request.clinicId)
                                }
                                onClick={() => provisionClinic(request.id)}
                              >
                                Создать клинику
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {!loading && !loadError && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">ЕГИСЗ / N3 — платформа Emkaro</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-600">
              {egiszClinics.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-100 text-left text-slate-600">
                      <tr>
                        <th className="px-3 py-2">Клиника</th>
                        <th className="px-3 py-2">Модуль</th>
                        <th className="px-3 py-2">Интеграция</th>
                        <th className="px-3 py-2">Режим</th>
                        <th className="px-3 py-2">N3</th>
                        <th className="px-3 py-2">Очередь</th>
                      </tr>
                    </thead>
                    <tbody>
                      {egiszClinics.map((row) => (
                        <tr key={row.clinicId} className="border-t border-slate-100">
                          <td className="px-3 py-2">
                            <div className="font-medium text-slate-800">{row.name}</div>
                            <div className="font-mono text-teal-700">{row.slug}</div>
                            {row.inn && <div className="text-slate-500">ИНН {row.inn}</div>}
                          </td>
                          <td className="px-3 py-2">{row.moduleEnabled ? "✓" : "—"}</td>
                          <td className="px-3 py-2">{row.integrationEnabled ? "✓" : "—"}</td>
                          <td className="px-3 py-2">
                            {row.stubMode ? "stub" : "live"}
                            {row.organizationOid && (
                              <div className="mt-0.5 max-w-[12rem] truncate text-slate-500">
                                OID {row.organizationOid}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2">{row.n3Configured ? "✓" : "—"}</td>
                          <td className="px-3 py-2">
                            {row.queuedCount} / {row.errorCount} / {row.sentCount}
                            <div className="text-slate-400">очередь / ошибки / sent</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {loading ? (
          <p className="text-sm text-slate-500">Загрузка клиник…</p>
        ) : loadError ? (
          <Card className="border-amber-200">
            <CardContent className="py-8 text-center text-sm text-amber-800">
              {loadError}
              <div className="mt-4">
                <Button variant="outline" size="sm" onClick={load}>
                  Повторить
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : clinics.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-slate-500">
              Клиники не найдены. Создайте клинику через скрипт `npm run create-clinic`.
            </CardContent>
          </Card>
        ) : (
          clinics.map((clinic) => {
            const egisz = egiszByClinicId.get(clinic.id);
            return (
              <Card key={clinic.id}>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-baseline justify-between gap-2">
                    <span>{clinic.name}</span>
                    <span className="font-mono text-sm font-normal text-teal-700">
                      {clinic.slug}
                    </span>
                  </CardTitle>
                  {egisz && (
                    <p className="text-xs text-slate-500">
                      ЕГИСЗ: {egisz.integrationEnabled ? "включён" : "выключен"} ·{" "}
                      {egisz.stubMode ? "stub" : "live"}
                      {egisz.n3Configured ? " · N3 настроен" : " · N3 не настроен"}
                    </p>
                  )}
                </CardHeader>
                <CardContent>
                  <p className="mb-3 text-xs text-slate-500">
                    Раздел «Настройки» (профиль, клиника, тема) всегда доступен и здесь не
                    отключается. Блок ЕГИСЗ — отдельный модуль.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {CONFIGURABLE_MODULE_IDS.map((moduleId) => (
                      <label
                        key={moduleId}
                        className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={clinic.modules[moduleId] !== false}
                          disabled={savingId === clinic.id}
                          onChange={() => toggleModule(clinic, moduleId)}
                          className="rounded border-slate-300"
                        />
                        <span>{MODULE_LABELS[moduleId]}</span>
                      </label>
                    ))}
                  </div>
                  <ClinicWipePanel
                    clinicId={clinic.id}
                    clinicSlug={clinic.slug}
                    clinicName={clinic.name}
                  />
                </CardContent>
              </Card>
            );
          })
        )}

        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Справочник N3 / ЕГИСЗ / НСИ</h2>
            <p className="text-sm text-slate-500">
              Подсказки по настройке интеграции, справочникам и VPN — только для супер-админа
            </p>
          </div>
          <EgiszIntegrationGuide />
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Шаблоны юр. документов</h2>
            <p className="text-sm text-slate-500">
              Справочник плейсхолдеров для договоров и согласий — виден только супер-админу
            </p>
          </div>
          <LegalTemplateGuide />
        </section>
      </main>
    </div>
  );
}
