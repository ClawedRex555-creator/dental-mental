"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PatientModal } from "@/components/patients/patient-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PATIENT_STATUS_LABELS, UI } from "@/lib/constants";
import type { Patient, PatientStatus } from "@/lib/types";
import { formatCurrency, formatDate, getAge, getFullName } from "@/lib/utils";
import { canDeletePatients } from "@/lib/rbac";
import { logAuditClient } from "@/lib/audit-client";
import { useClinicStore } from "@/store/useClinicStore";

export default function PatientsPage() {
  const { patients, currentUser, deletePatient } = useClinicStore();
  const canDelete = canDeletePatients(currentUser.role);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PatientStatus | "all">("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Patient | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return patients.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (!q) return true;
      const name = getFullName(p.firstName, p.lastName, p.middleName).toLowerCase();
      return (
        name.includes(q) ||
        p.phone.includes(q) ||
        (p.email?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [patients, search, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Пациенты</h1>
          <p className="text-sm text-slate-500">{patients.length} {UI.total}</p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Добавить пациента
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-wrap gap-3 p-4">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder={UI.searchPatients}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as PatientStatus | "all")}
          >
            <option value="all">{UI.allStatuses}</option>
            {Object.entries(PATIENT_STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-slate-500">
                <th className="px-4 py-3 font-medium">{UI.patient}</th>
                <th className="px-4 py-3 font-medium">{UI.phone}</th>
                <th className="px-4 py-3 font-medium">{UI.age}</th>
                <th className="px-4 py-3 font-medium">{UI.status}</th>
                <th className="px-4 py-3 font-medium">{UI.balance}</th>
                <th className="px-4 py-3 font-medium">{UI.lastVisit}</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/patients/${p.id}`}
                      className="font-medium text-teal-700 hover:underline"
                    >
                      {getFullName(p.firstName, p.lastName, p.middleName)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{p.phone}</td>
                  <td className="px-4 py-3">{getAge(p.birthDate)}</td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary">{PATIENT_STATUS_LABELS[p.status]}</Badge>
                  </td>
                  <td
                    className={`px-4 py-3 font-medium ${p.balance < 0 ? "text-red-600" : ""}`}
                  >
                    {formatCurrency(p.balance)}
                  </td>
                  <td className="px-4 py-3">{formatDate(p.lastVisitDate)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing(p);
                          setModalOpen(true);
                        }}
                      >
                        {UI.edit}
                      </Button>
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => {
                            const name = getFullName(p.firstName, p.lastName, p.middleName);
                            if (
                              !window.confirm(
                                `Удалить пациента «${name}»?\n\nБудут удалены записи, медкарта, планы, акты, платежи и файлы. Действие нельзя отменить.`
                              )
                            ) {
                              return;
                            }
                            if (deletePatient(p.id)) {
                              logAuditClient({
                                action: "delete",
                                resourceType: "patient",
                                resourceId: p.id,
                              });
                              toast.success("Пациент удалён");
                            } else {
                              toast.error("Не удалось удалить пациента");
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="px-4 py-8 text-center text-slate-500">Пациенты не найдены</p>
          )}
        </div>
      </Card>

      <PatientModal open={modalOpen} onOpenChange={setModalOpen} patient={editing} />
    </div>
  );
}
