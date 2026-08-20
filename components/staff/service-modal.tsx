"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Service } from "@/lib/types";
import { DENTAL_SERVICE_NAMES } from "@/lib/catalogs";
import {
  getClinicBillableServices,
  getTechnicalServices,
  isTechnicalService,
  SERVICE_CATEGORY_TECHNICAL,
  SERVICE_CATEGORIES,
  normalizeServiceCategory,
  type ServiceCategory,
} from "@/lib/service-categories";
import {
  getNmuDisplayName,
  listNmuDentalOptions,
  suggestNmuCodeFromName,
} from "@/lib/egisz/cda/nsi-display-names";
import { SearchAutocomplete } from "@/components/shared/search-autocomplete";
import { ClinicServiceSearch } from "@/components/shared/clinic-service-search";
import { UI } from "@/lib/constants";
import {
  deleteServiceViaCommandApi,
  upsertServiceViaCommandApi,
} from "@/lib/clinic-service.client";
import {
  markClinicSyncedAfterCommand,
  notifyClinicDataChanged,
} from "@/lib/clinic-data-sync.client";
import {
  beginClinicCommandMutation,
  endClinicCommandMutation,
  runWithoutClinicFlush,
  useClinicStore,
} from "@/store/useClinicStore";
import { generateId, serviceNotes } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ServiceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service?: Service | null;
  createMode?: "clinic" | "technical";
  defaultTechnicianName?: string;
}

export function ServiceModal({
  open,
  onOpenChange,
  service,
  createMode = "clinic",
  defaultTechnicianName,
}: ServiceModalProps) {
  const { addService, updateService, removeService, services } = useClinicStore();
  const isEdit = !!service;
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>(SERVICE_CATEGORIES[0]);
  const [price, setPrice] = useState("");
  const [priceIsFrom, setPriceIsFrom] = useState(false);
  const [notes, setNotes] = useState("");
  const [nmuCode, setNmuCode] = useState("");
  const [technicianName, setTechnicianName] = useState("");
  const [linkedClinicServiceId, setLinkedClinicServiceId] = useState("");
  const [linkedClinicServiceName, setLinkedClinicServiceName] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const initialized = useRef(false);

  const nmuOptions = useMemo(() => listNmuDentalOptions(), []);
  const clinicServices = useMemo(
    () => getClinicBillableServices(services),
    [services]
  );
  const knownTechnicians = useMemo(
    () =>
      Array.from(
        new Set(
          getTechnicalServices(services)
            .map((s) => s.technicianName?.trim())
            .filter((value): value is string => Boolean(value))
        )
      ).sort((a, b) => a.localeCompare(b, "ru")),
    [services]
  );
  const mode: "clinic" | "technical" = service
    ? isTechnicalService(service)
      ? "technical"
      : "clinic"
    : createMode;
  const isTechnicalMode = mode === "technical";

  useEffect(() => {
    if (!open) {
      initialized.current = false;
      return;
    }
    if (initialized.current) return;
    initialized.current = true;
    if (service) {
      setName(service.name);
      setCategory(service.category || SERVICE_CATEGORIES[0]);
      setPrice(String(service.price));
      setPriceIsFrom(Boolean(service.priceIsFrom));
      setNotes(serviceNotes(service) ?? "");
      setNmuCode(service.nmuCode?.trim() ?? "");
      setTechnicianName(service.technicianName?.trim() ?? "");
      setLinkedClinicServiceId(service.linkedClinicServiceId?.trim() ?? "");
      setLinkedClinicServiceName(service.linkedClinicServiceName?.trim() ?? "");
      setDeleteConfirmOpen(false);
      setDeleteConfirmText("");
    } else {
      setName("");
      setCategory(isTechnicalMode ? SERVICE_CATEGORY_TECHNICAL : SERVICE_CATEGORIES[0]);
      setPrice("");
      setPriceIsFrom(false);
      setNotes("");
      setNmuCode("");
      setTechnicianName(defaultTechnicianName?.trim() ?? "");
      setLinkedClinicServiceId("");
      setLinkedClinicServiceName("");
      setDeleteConfirmOpen(false);
      setDeleteConfirmText("");
    }
  }, [open, service, isTechnicalMode, defaultTechnicianName]);

  const handleNameChange = (next: string) => {
    setName(next);
    if (isTechnicalMode) return;
    if (!nmuCode.trim()) {
      const suggested = suggestNmuCodeFromName(next);
      if (suggested) setNmuCode(suggested);
    }
  };

  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const handleSave = () => {
    if (savingRef.current) return;
    if (isTechnicalMode) {
      if (!price.trim()) {
        toast.error("Укажите стоимость технички");
        return;
      }
    } else if (!name.trim() || !price.trim()) {
      toast.error("Заполните название и цену");
      return;
    }

    const trimmedNotes = notes.trim();
    const trimmedNmu = nmuCode.trim();
    const amount = Number(price) || 0;
    if (amount <= 0) {
      toast.error("Цена должна быть больше 0");
      return;
    }

    const payload: Service = {
      id: service?.id ?? generateId("srv"),
      name: name.trim(),
      category: normalizeServiceCategory(
        isTechnicalMode ? SERVICE_CATEGORY_TECHNICAL : category
      ),
      price: amount,
      priceIsFrom: isTechnicalMode ? false : priceIsFrom,
      notes: trimmedNotes || undefined,
      nmuCode: isTechnicalMode ? undefined : trimmedNmu || undefined,
      linkedClinicServiceId: undefined,
      linkedClinicServiceName: undefined,
      technicianName: undefined,
      active: true,
    };

    if (isTechnicalMode) {
      const techName = technicianName.trim();
      if (!techName) {
        toast.error("Укажите имя техника");
        return;
      }
      if (!linkedClinicServiceId) {
        toast.error("Привяжите техничку к услуге клиники");
        return;
      }
      const linked = clinicServices.find((s) => s.id === linkedClinicServiceId);
      if (!linked) {
        toast.error("Привязанная услуга клиники не найдена. Выберите заново.");
        return;
      }
      if (amount > linked.price) {
        toast.error("Техничка не может быть больше стоимости услуги клиники");
        return;
      }
      payload.name = linked.name;
      payload.technicianName = techName;
      payload.linkedClinicServiceId = linked.id;
      payload.linkedClinicServiceName = linked.name;
    } else if (trimmedNmu && !getNmuDisplayName(trimmedNmu)) {
      toast.error(
        "Код НМУ не из встроенного справочника. Выберите код из списка — иначе ЕГИСЗ отклонит документ."
      );
      return;
    }

    savingRef.current = true;
    setSaving(true);
    beginClinicCommandMutation();
    void (async () => {
      try {
        const api = await upsertServiceViaCommandApi(payload);
        if (!api.ok) {
          toast.error(api.error ?? "Не удалось сохранить услугу на сервере");
          return;
        }
        runWithoutClinicFlush(() => {
          if (isEdit && service) {
            updateService(service.id, payload);
          } else {
            addService(payload);
          }
        });
        markClinicSyncedAfterCommand(api.updatedAt, api.revision);
        useClinicStore.getState().pauseClinicAutoSave(15_000);
        notifyClinicDataChanged();
        toast.success(isEdit ? "Услуга обновлена" : "Услуга добавлена");
        onOpenChange(false);
      } finally {
        endClinicCommandMutation();
        savingRef.current = false;
        setSaving(false);
      }
    })();
  };

  const handleDelete = () => {
    if (!service || savingRef.current) return;
    if (deleteConfirmText.trim() !== service.name.trim()) {
      toast.error("Введите точное название услуги для удаления");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    beginClinicCommandMutation();
    void (async () => {
      try {
        const api = await deleteServiceViaCommandApi(service.id);
        if (!api.ok) {
          toast.error(api.error ?? "Не удалось удалить услугу на сервере");
          return;
        }
        runWithoutClinicFlush(() => {
          removeService(service.id);
        });
        markClinicSyncedAfterCommand(api.updatedAt, api.revision);
        useClinicStore.getState().pauseClinicAutoSave(15_000);
        notifyClinicDataChanged();
        toast.success("Услуга удалена из прайса");
        onOpenChange(false);
      } finally {
        endClinicCommandMutation();
        savingRef.current = false;
        setSaving(false);
      }
    })();
  };

  const selectedNmuName = nmuCode.trim() ? getNmuDisplayName(nmuCode) : undefined;
  const linkedClinicService = clinicServices.find((s) => s.id === linkedClinicServiceId);
  const linkedClinicLabel = linkedClinicService?.name ?? linkedClinicServiceName;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? isTechnicalMode
                ? "Редактировать техничку"
                : "Редактировать услугу"
              : isTechnicalMode
                ? "Добавить техничку"
                : "Добавить услугу"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {isTechnicalMode ? (
            <>
              <div className="space-y-2">
                <Label>Техник</Label>
                <Input
                  value={technicianName}
                  onChange={(e) => setTechnicianName(e.target.value)}
                  placeholder="Например, Иван Петров"
                  list="known-technicians"
                />
                <datalist id="known-technicians">
                  {knownTechnicians.map((tech) => (
                    <option key={tech} value={tech} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-2">
                <Label>Привязка к услуге клиники</Label>
                <ClinicServiceSearch
                  services={clinicServices}
                  selectedServiceId={linkedClinicServiceId}
                  onSelect={(linked) => {
                    setLinkedClinicServiceId(linked.id);
                    setLinkedClinicServiceName(linked.name);
                    setName(linked.name);
                  }}
                  placeholder="Найдите услугу клиники..."
                />
                {linkedClinicLabel && (
                  <p className="text-xs text-[var(--muted)]">
                    Привязано к: {linkedClinicLabel}
                    {linkedClinicService
                      ? ` · максимум технички ${linkedClinicService.price.toLocaleString("ru-RU")} ₽`
                      : " · исходная услуга удалена из прайса"}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Стоимость технички, ₽</Label>
                <Input
                  type="number"
                  min={0}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
                <p className="text-xs text-[var(--muted)]">
                  В акте сумма технички вычитается до расчёта ЗП врача и доли клиники.
                </p>
              </div>
            </>
          ) : (
            <>
              <SearchAutocomplete
                label="Название услуги"
                value={name}
                onChange={handleNameChange}
                catalog={DENTAL_SERVICE_NAMES}
                placeholder="гигиена, имплант, коронка..."
                required
              />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Категория</Label>
                  <select
                    className="relative z-30 flex h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--input-bg)] px-3 text-sm text-[var(--foreground)]"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    {/* Текущая категория, если её нет в справочнике — иначе select «залипает» */}
                    {category &&
                      !SERVICE_CATEGORIES.includes(category as ServiceCategory) &&
                      category !== SERVICE_CATEGORY_TECHNICAL && (
                        <option value={category}>{category}</option>
                      )}
                    {SERVICE_CATEGORIES.filter((c) => c !== SERVICE_CATEGORY_TECHNICAL).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>{priceIsFrom ? "Цена от, ₽" : "Цена, ₽"}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                </div>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--foreground)]">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-[var(--border)]"
                  checked={priceIsFrom}
                  onChange={(e) => setPriceIsFrom(e.target.checked)}
                />
                Цена «от» (минимальная, итоговая может быть выше)
              </label>
              <div className="space-y-2">
                <Label>Код НМУ для ЕГИСЗ</Label>
                <select
                  className="flex h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--input-bg)] px-3 text-sm text-[var(--foreground)]"
                  value={nmuCode}
                  onChange={(e) => setNmuCode(e.target.value)}
                >
                  <option value="">Не задан (подберётся по названию)</option>
                  {nmuOptions.map((opt) => (
                    <option key={opt.code} value={opt.code}>
                      {opt.code} — {opt.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-[var(--muted)]">
                  В СЭМД уходит код и точное наименование из справочника НСИ 1070
                  {selectedNmuName ? `: «${selectedNmuName}»` : ""}.
                </p>
              </div>
            </>
          )}
          <div className="space-y-2">
            <Label>Примечания</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Сроки, материалы, что входит в стоимость..."
              rows={3}
              className="resize-y"
            />
          </div>
          {isEdit && service && (
            <div className="space-y-3 rounded-lg border border-red-200 bg-red-50/60 p-3">
              <p className="text-sm font-semibold text-red-700">Удаление услуги</p>
              <p className="text-xs text-red-700">
                Услуга удалится из общего прайса для всех сотрудников. В уже созданных актах она
                останется как историческая запись.
              </p>
              {!deleteConfirmOpen ? (
                <Button
                  type="button"
                  variant="outline"
                  className="border-red-300 text-red-700 hover:bg-red-100"
                  onClick={() => setDeleteConfirmOpen(true)}
                >
                  <Trash2 className="h-4 w-4" />
                  Удалить услугу
                </Button>
              ) : (
                <div className="space-y-2 rounded-md border border-red-300 bg-white p-3">
                  <p className="text-xs text-[var(--muted)]">
                    Для подтверждения введите название услуги:{" "}
                    <strong className="text-[var(--foreground)]">{service.name}</strong>
                  </p>
                  <Input
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder={service.name}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setDeleteConfirmOpen(false);
                        setDeleteConfirmText("");
                      }}
                    >
                      Отмена удаления
                    </Button>
                    <Button
                      type="button"
                      className="bg-red-600 hover:bg-red-700"
                      onClick={handleDelete}
                      disabled={saving || deleteConfirmText.trim() !== service.name.trim()}
                    >
                      Подтвердить удаление
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              {UI.cancel}
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Сохранение…" : UI.save}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
