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
import {
  formatPassportNumber,
  formatPassportSeries,
  validatePhone,
} from "@/lib/document-validation";
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
  const { addDoctor, updateDoctor, assignStaffToCabinet, cabinets } = useClinicStore();
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
  const [passportSeries, setPassportSeries] = useState("");
  const [passportNumber, setPassportNumber] = useState("");
  const [diplomaCertificate, setDiplomaCertificate] = useState("");
  const [commissionPercent, setCommissionPercent] = useState("25");
  const [implantFeeType, setImplantFeeType] = useState<"percent" | "rubles">("percent");
  const [implantFee, setImplantFee] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [snils, setSnils] = useState("");
  const [frmrOid, setFrmrOid] = useState("");
  const [positionCode, setPositionCode] = useState("100");
  const [n3PositionId, setN3PositionId] = useState("100");
  const [n3SpecialityId, setN3SpecialityId] = useState("171");
  const [certThumbprint, setCertThumbprint] = useState("");
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
      setPassportSeries(member.passportSeries ?? "");
      setPassportNumber(member.passportNumber ?? "");
      setDiplomaCertificate(member.diplomaCertificate ?? "");
      setCommissionPercent(String(member.commissionPercent ?? 25));
      setImplantFeeType(member.implantFeeType ?? "percent");
      setImplantFee(member.implantFee != null ? String(member.implantFee) : "");
      setHourlyRate(member.hourlyRate != null ? String(member.hourlyRate) : "");
      setSnils(member.snils ?? "");
      setFrmrOid(member.frmrOid ?? "");
      setPositionCode(member.positionCode ?? "100");
      setN3PositionId(member.n3PositionId ?? "100");
      setN3SpecialityId(member.n3SpecialityId ?? "171");
      setCertThumbprint(member.certThumbprint ?? "");
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
      setPassportSeries("");
      setPassportNumber("");
      setDiplomaCertificate("");
      setCommissionPercent("25");
      setImplantFeeType("percent");
      setImplantFee("");
      setHourlyRate("");
      setSnils("");
      setFrmrOid("");
      setPositionCode("100");
      setN3PositionId("100");
      setN3SpecialityId("171");
      setCertThumbprint("");
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
      passportSeries: passportSeries.trim() || undefined,
      passportNumber: passportNumber.trim() || undefined,
      diplomaCertificate: diplomaCertificate.trim() || undefined,
      commissionPercent: role === "doctor" ? Number(commissionPercent) || 0 : 0,
      implantFeeType:
        role === "doctor" && implantFee.trim() ? implantFeeType : undefined,
      implantFee:
        role === "doctor" && implantFee.trim()
          ? Number(implantFee.replace(",", ".")) || 0
          : undefined,
      hourlyRate: role === "assistant" ? Number(hourlyRate) || 0 : undefined,
      snils: snils.trim() || undefined,
      frmrOid: frmrOid.trim() || undefined,
      positionCode: positionCode.trim() || undefined,
      n3PositionId: n3PositionId.trim() || undefined,
      n3SpecialityId: n3SpecialityId.trim() || undefined,
      certThumbprint: certThumbprint.trim() || undefined,
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
      if (role === "doctor" && cabinetId) {
        assignStaffToCabinet(cabinetId, member.id);
      }

      const passwordChange =
        authPassword.length > 0 || authPasswordConfirm.length > 0;
      const profileChanged =
        member.role !== role ||
        member.email.trim().toLowerCase() !== loginEmail ||
        member.name.trim() !== name.trim();
      const needsAuthSync = passwordChange || profileChanged;

      if (needsAuthSync) {
        if (!loginEmail) {
          toast.error("Укажите email — он используется как логин для входа");
          return;
        }
        if (passwordChange) {
          if (authPassword.length < 8) {
            toast.error("Пароль для входа — не менее 8 символов");
            return;
          }
          if (authPassword !== authPasswordConfirm) {
            toast.error("Пароли не совпадают");
            return;
          }
        }

        try {
          setSaving(true);
          const res = await fetch("/api/auth/accounts", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({
              staffId: member.id,
              login: loginEmail,
              role,
              name: name.trim(),
              ...(passwordChange ? { password: authPassword } : {}),
            }),
          });
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          if (!res.ok) {
            toast.error(data.error ?? "Не удалось обновить доступ для входа");
            return;
          }
          toast.success(
            passwordChange
              ? "Сотрудник, роль и пароль для входа обновлены"
              : "Сотрудник и роль для входа обновлены"
          );
        } catch {
          toast.error("Не удалось обновить доступ. Проверьте соединение.");
          return;
        } finally {
          setSaving(false);
        }
      } else {
        toast.success("Сотрудник обновлён");
      }

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
      if (role === "doctor" && cabinetId) {
        assignStaffToCabinet(cabinetId, staffId);
      }
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
              className="select-field"
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
            <div className="form-panel space-y-2">
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
                  className="select-field"
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
                Email {isEdit ? "(логин для входа)" : "(логин для входа)"}{" "}
                {!isEdit && null}
                {isEdit && !email.trim() && (
                  <span style={{ color: "var(--callout-stub-text)" }}> — обязателен для доступа</span>
                )}
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
            <div className="form-panel form-panel-info grid grid-cols-2 gap-3">
              <div className="space-y-2 sm:col-span-2">
                <p className="form-panel-title">Доступ в систему</p>
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

          {isEdit && (
            <div className="form-panel grid grid-cols-2 gap-3">
              <div className="space-y-2 sm:col-span-2">
                <p className="form-panel-title">
                  Доступ в систему — заполните, чтобы выдать или сменить пароль
                </p>
              </div>
              <div className="space-y-2">
                <Label>Новый пароль</Label>
                <Input
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  placeholder="Не менять — оставить пустым"
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
                className="select-field"
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
                {UI.doctorAddress} <span className="text-[var(--muted)]">({UI.optional})</span>
              </Label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="г. Москва, ул. ..."
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>
                {UI.passportSeries}{" "}
                <span className="text-[var(--muted)]">({UI.optional})</span>
              </Label>
              <Input
                value={passportSeries}
                onChange={(e) =>
                  setPassportSeries(formatPassportSeries(e.target.value))
                }
                placeholder="0000"
                inputMode="numeric"
              />
            </div>
            <div className="space-y-2">
              <Label>
                {UI.passportNumber}{" "}
                <span className="text-[var(--muted)]">({UI.optional})</span>
              </Label>
              <Input
                value={passportNumber}
                onChange={(e) =>
                  setPassportNumber(formatPassportNumber(e.target.value))
                }
                placeholder="000000"
                inputMode="numeric"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>
              {UI.diplomaCertificate}{" "}
              <span className="text-[var(--muted)]">({UI.optional})</span>
            </Label>
            <Input
              value={diplomaCertificate}
              onChange={(e) => setDiplomaCertificate(e.target.value)}
              placeholder="Номер сертификата или реестровая запись"
            />
          </div>

          {role === "doctor" && (
            <>
            <div className="space-y-2">
              <Label>Комиссия, %</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={commissionPercent}
                onChange={(e) => setCommissionPercent(e.target.value)}
              />
              <p className="text-xs text-[var(--muted)]">
                Процент от суммы акта по всем услугам, кроме категории «Имплантация».
              </p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Вознаграждение за имплантацию</Label>
              <div className="flex flex-wrap gap-2">
                <select
                  className="flex h-10 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)]"
                  value={implantFeeType}
                  onChange={(e) =>
                    setImplantFeeType(e.target.value as "percent" | "rubles")
                  }
                >
                  <option value="percent">Процент от суммы услуги</option>
                  <option value="rubles">Фиксированная сумма за единицу, ₽</option>
                </select>
                <Input
                  type="number"
                  min={0}
                  className="w-40"
                  value={implantFee}
                  onChange={(e) => setImplantFee(e.target.value)}
                  placeholder={implantFeeType === "percent" ? "например 15" : "например 5000"}
                />
              </div>
              <p className="text-xs text-[var(--muted)]">
                Применяется только к услугам из вкладки «Имплантация» в прайсе. Протезирование
                на имплантате — отдельная вкладка «Протезирование», считается по общей комиссии %.
              </p>
            </div>
            <div className="form-panel grid grid-cols-2 gap-3 sm:col-span-2">
              <p className="form-panel-title sm:col-span-2">ЕГИСЗ / N3 (врач)</p>
              <div className="space-y-2">
                <Label>СНИЛС врача</Label>
                <Input value={snils} onChange={(e) => setSnils(e.target.value)} placeholder="00000000000" />
              </div>
              <div className="space-y-2">
                <Label>OID ФРМР</Label>
                <Input value={frmrOid} onChange={(e) => setFrmrOid(e.target.value)} placeholder="1.2.643..." />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Код должности (NSI 1002)</Label>
                <Input value={positionCode} onChange={(e) => setPositionCode(e.target.value)} placeholder="100 — врач-стоматолог" />
              </div>
              <div className="space-y-2">
                <Label>N3 IdPosition</Label>
                <Input value={n3PositionId} onChange={(e) => setN3PositionId(e.target.value)} placeholder="100 — тот же справочник 1002" />
              </div>
              <div className="space-y-2">
                <Label>N3 IdSpeciality</Label>
                <Input value={n3SpecialityId} onChange={(e) => setN3SpecialityId(e.target.value)} placeholder="171 — стоматология общей практики" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Отпечаток КЭП врача (CryptoPro)</Label>
                <Input
                  value={certThumbprint}
                  onChange={(e) => setCertThumbprint(e.target.value)}
                  placeholder="40 hex-символов, у каждого врача свой"
                  className="font-mono text-xs"
                />
                <p className="text-xs text-[var(--muted)]">
                  Личная КЭП врача. Для stub-теста можно не заполнять.
                </p>
              </div>
            </div>
            </>
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
