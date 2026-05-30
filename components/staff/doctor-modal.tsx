"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Doctor, UserRole } from "@/lib/types";
import {
  DOCTOR_SPECIALIZATION_OTHER,
  DOCTOR_SPECIALIZATIONS,
  ROLE_LABELS,
  UI,
} from "@/lib/constants";
import { validatePhone } from "@/lib/document-validation";
import { normalizePhoneInput } from "@/lib/phone-utils";
import { PhoneInput } from "@/components/shared/phone-input";
import { useClinicStore } from "@/store/useClinicStore";
import { generateId } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DoctorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member?: Doctor | null;
}

function specializationKeyFromDoctor(spec: string): string {
  if ((DOCTOR_SPECIALIZATIONS as readonly string[]).includes(spec)) return spec;
  return DOCTOR_SPECIALIZATION_OTHER;
}

export function DoctorModal({ open, onOpenChange, member }: DoctorModalProps) {
  const { addDoctor, updateDoctor, cabinets } = useClinicStore();
  const isEdit = !!member;

  const [name, setName] = useState("");
  const [specializationKey, setSpecializationKey] = useState<string>(
    DOCTOR_SPECIALIZATIONS[0]
  );
  const [selectedSpecs, setSelectedSpecs] = useState<string[]>([DOCTOR_SPECIALIZATIONS[0]]);
  const [customSpecialization, setCustomSpecialization] = useState("");
  const [phone, setPhone] = useState("+7");
  const [email, setEmail] = useState("");
  const [cabinetId, setCabinetId] = useState("");
  const [address, setAddress] = useState("");
  const [diplomaCertificate, setDiplomaCertificate] = useState("");
  const [commissionPercent, setCommissionPercent] = useState("25");
  const [hourlyRate, setHourlyRate] = useState("");
  const [role, setRole] = useState<UserRole>("doctor");
  const [authPassword, setAuthPassword] = useState("");
  const [authPasswordConfirm, setAuthPasswordConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (member) {
      const specs =
        member.specializations?.length
          ? member.specializations
          : member.specialization
            ? [member.specialization]
            : [];
      const known = specs.filter((s) =>
        (DOCTOR_SPECIALIZATIONS as readonly string[]).includes(s)
      );
      const custom = specs.find(
        (s) => !(DOCTOR_SPECIALIZATIONS as readonly string[]).includes(s)
      );
      const key = custom
        ? DOCTOR_SPECIALIZATION_OTHER
        : specializationKeyFromDoctor(specs[0] ?? DOCTOR_SPECIALIZATIONS[0]);
      setName(member.name);
      setSpecializationKey(key);
      setSelectedSpecs(
        member.role === "doctor"
          ? [...known, ...(custom ? [DOCTOR_SPECIALIZATION_OTHER] : [])]
          : specs.length
            ? specs
            : [DOCTOR_SPECIALIZATIONS[0]]
      );
      setCustomSpecialization(custom ?? "");
      setPhone(member.phone || "+7");
      setEmail(member.email ?? "");
      setCabinetId(member.cabinetId ?? "");
      setAddress(member.address ?? "");
      setDiplomaCertificate(member.diplomaCertificate ?? "");
      setCommissionPercent(String(member.commissionPercent ?? 25));
      setHourlyRate(member.hourlyRate != null ? String(member.hourlyRate) : "");
      setRole(member.role);
    } else {
      setName("");
      setSpecializationKey(DOCTOR_SPECIALIZATIONS[0]);
      setSelectedSpecs([DOCTOR_SPECIALIZATIONS[0]]);
      setCustomSpecialization("");
      setPhone("+7");
      setEmail("");
      setCabinetId("");
      setAddress("");
      setDiplomaCertificate("");
      setCommissionPercent("25");
      setHourlyRate("");
      setRole("doctor");
      setAuthPassword("");
      setAuthPasswordConfirm("");
    }
  }, [open, member?.id]);

  const resolvedSpecialization =
    specializationKey === DOCTOR_SPECIALIZATION_OTHER
      ? customSpecialization.trim()
      : specializationKey;

  const toggleSpec = (spec: string) => {
    setSelectedSpecs((prev) => {
      if (prev.includes(spec)) {
        const next = prev.filter((s) => s !== spec);
        return next.length ? next : prev;
      }
      return [...prev, spec];
    });
  };

  const resolvedDoctorSpecs = (): string[] => {
    const list = selectedSpecs.filter((s) => s !== DOCTOR_SPECIALIZATION_OTHER);
    if (selectedSpecs.includes(DOCTOR_SPECIALIZATION_OTHER)) {
      const custom = customSpecialization.trim();
      if (custom) list.push(custom);
    }
    return list;
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Укажите ФИО");
      return;
    }
    const specsForDoctor = role === "doctor" ? resolvedDoctorSpecs() : [];
    const specSingle = role === "doctor" ? specsForDoctor[0] : resolvedSpecialization;
    if (!specSingle) {
      toast.error(
        role === "doctor" ? "Выберите хотя бы одну специализацию" : "Укажите специализацию"
      );
      return;
    }

    const phoneCheck = validatePhone(phone);
    if (!phoneCheck.valid) {
      toast.error(phoneCheck.message);
      return;
    }

    const payload = {
      name: name.trim(),
      specialization: specSingle,
      specializations: role === "doctor" ? specsForDoctor : undefined,
      phone: normalizePhoneInput(phone),
      email: email.trim(),
      cabinetId: cabinetId || undefined,
      cabinet: cabinets.find((c) => c.id === cabinetId)?.name ?? "—",
      address: address.trim() || undefined,
      diplomaCertificate: diplomaCertificate.trim() || undefined,
      commissionPercent: role === "doctor" ? Number(commissionPercent) || 0 : 0,
      hourlyRate: role === "assistant" ? Number(hourlyRate) || 0 : undefined,
      role,
    };

    const staffId = isEdit && member ? member.id : generateId("doc");
    const loginEmail = email.trim().toLowerCase();

    if (!isEdit) {
      if (!loginEmail) {
        toast.error("Укажите email — он будет логином для входа в систему");
        return;
      }
      if (authPassword.length < 8) {
        toast.error("Пароль для входа — не менее 8 символов");
        return;
      }
      if (authPassword !== authPasswordConfirm) {
        toast.error("Пароли не совпадают");
        return;
      }
    }

    if (isEdit && member) {
      updateDoctor(member.id, payload);
      toast.success("Сотрудник обновлён");
      onOpenChange(false);
      return;
    }

    try {
      setSaving(true);
      const res = await fetch("/api/auth/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          id: `auth-${staffId}`,
          login: loginEmail,
          password: authPassword,
          role,
          name: name.trim(),
          staffId,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Не удалось создать учётную запись");
        return;
      }

      addDoctor({
        id: staffId,
        ...payload,
        status: "active",
      });
      toast.success("Сотрудник и учётная запись для входа созданы");
      onOpenChange(false);
    } catch {
      toast.error("Не удалось создать учётную запись. Проверьте соединение.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Редактировать сотрудника" : "Добавить сотрудника"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>ФИО</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dr. Иван Иванов"
            />
          </div>

          <div className="space-y-2">
            <Label>Роль в клинике</Label>
            <select
              className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
            >
              {(["doctor", "admin", "assistant", "accountant"] as UserRole[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>

          {role === "doctor" ? (
            <div className="space-y-2 rounded-lg border border-slate-200 p-3">
              <Label>{UI.specialization} (можно несколько)</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {DOCTOR_SPECIALIZATIONS.map((s) => (
                  <label key={s} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedSpecs.includes(s)}
                      onChange={() => toggleSpec(s)}
                    />
                    {s}
                  </label>
                ))}
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedSpecs.includes(DOCTOR_SPECIALIZATION_OTHER)}
                    onChange={() => toggleSpec(DOCTOR_SPECIALIZATION_OTHER)}
                  />
                  {DOCTOR_SPECIALIZATION_OTHER}
                </label>
              </div>
              {selectedSpecs.includes(DOCTOR_SPECIALIZATION_OTHER) && (
                <Input
                  value={customSpecialization}
                  onChange={(e) => setCustomSpecialization(e.target.value)}
                  placeholder="Например: эндодонт"
                />
              )}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>{UI.specialization}</Label>
                <select
                  className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900"
                  value={specializationKey}
                  onChange={(e) => setSpecializationKey(e.target.value)}
                >
                  {DOCTOR_SPECIALIZATIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                  <option value={DOCTOR_SPECIALIZATION_OTHER}>
                    {DOCTOR_SPECIALIZATION_OTHER}
                  </option>
                </select>
              </div>
              {specializationKey === DOCTOR_SPECIALIZATION_OTHER && (
                <div className="space-y-2">
                  <Label>Своя специализация</Label>
                  <Input
                    value={customSpecialization}
                    onChange={(e) => setCustomSpecialization(e.target.value)}
                    placeholder="Например: эндодонт"
                  />
                </div>
              )}
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{UI.doctorPhone}</Label>
              <PhoneInput value={phone} onChange={setPhone} />
            </div>
            <div className="space-y-2">
              <Label>
                Email {isEdit ? "" : "(логин для входа)"}{" "}
                {isEdit && <span className="text-slate-400">({UI.optional})</span>}
              </Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@clinic.ru"
                required={!isEdit}
              />
            </div>
          </div>

          {!isEdit && (
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-teal-100 bg-teal-50/50 p-3">
              <div className="space-y-2 sm:col-span-2">
                <p className="text-xs font-medium text-teal-900">Доступ в систему</p>
              </div>
              <div className="space-y-2">
                <Label>Пароль</Label>
                <Input
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                />
              </div>
              <div className="space-y-2">
                <Label>Повтор пароля</Label>
                <Input
                  type="password"
                  value={authPasswordConfirm}
                  onChange={(e) => setAuthPasswordConfirm(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Кабинет</Label>
              <select
                className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900"
                value={cabinetId}
                onChange={(e) => setCabinetId(e.target.value)}
              >
                <option value="">Не назначен</option>
                {cabinets.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} №{c.number}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>
                {UI.doctorAddress} <span className="text-slate-400">({UI.optional})</span>
              </Label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="г. Москва, ул. ..."
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>
              {UI.diplomaCertificate}{" "}
              <span className="text-slate-400">({UI.optional})</span>
            </Label>
            <Input
              value={diplomaCertificate}
              onChange={(e) => setDiplomaCertificate(e.target.value)}
              placeholder="Номер сертификата или реестровая запись"
            />
          </div>

          {role === "doctor" && (
            <div className="space-y-2">
              <Label>Комиссия, %</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={commissionPercent}
                onChange={(e) => setCommissionPercent(e.target.value)}
              />
            </div>
          )}
          {role === "assistant" && (
            <div className="space-y-2">
              <Label>Почасовая ставка, ₽/час</Label>
              <Input
                type="number"
                min={0}
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                placeholder="500"
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              {UI.cancel}
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? "Сохранение…" : UI.save}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
