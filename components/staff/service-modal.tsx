"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Service } from "@/lib/types";
import { DENTAL_SERVICE_NAMES } from "@/lib/catalogs";
import {
  SERVICE_CATEGORIES,
  normalizeServiceCategory,
  type ServiceCategory,
} from "@/lib/service-categories";
import { SearchAutocomplete } from "@/components/shared/search-autocomplete";
import { UI } from "@/lib/constants";
import { useClinicStore } from "@/store/useClinicStore";
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
}

export function ServiceModal({ open, onOpenChange, service }: ServiceModalProps) {
  const { addService, updateService, removeService } = useClinicStore();
  const isEdit = !!service;
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ServiceCategory>(SERVICE_CATEGORIES[0]);
  const [price, setPrice] = useState("");
  const [priceIsFrom, setPriceIsFrom] = useState(false);
  const [notes, setNotes] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const initialized = useRef(false);

  useEffect(() => {
    if (!open) {
      initialized.current = false;
      return;
    }
    if (initialized.current) return;
    initialized.current = true;
    if (service) {
      setName(service.name);
      setCategory(service.category as ServiceCategory);
      setPrice(String(service.price));
      setPriceIsFrom(Boolean(service.priceIsFrom));
      setNotes(serviceNotes(service) ?? "");
      setDeleteConfirmOpen(false);
      setDeleteConfirmText("");
    } else {
      setName("");
      setCategory(SERVICE_CATEGORIES[0]);
      setPrice("");
      setPriceIsFrom(false);
      setNotes("");
      setDeleteConfirmOpen(false);
      setDeleteConfirmText("");
    }
  }, [open, service]);

  const handleSave = () => {
    if (!name.trim() || !price.trim()) {
      toast.error("Заполните название и цену");
      return;
    }

    const trimmedNotes = notes.trim();
    const payload = {
      name: name.trim(),
      category: normalizeServiceCategory(category),
      price: Number(price) || 0,
      priceIsFrom,
      notes: trimmedNotes || undefined,
      active: true,
    };

    if (isEdit && service) {
      updateService(service.id, payload);
      toast.success("Услуга обновлена");
    } else {
      addService({ id: generateId("srv"), ...payload });
      toast.success("Услуга добавлена");
    }
    onOpenChange(false);
  };

  const handleDelete = () => {
    if (!service) return;
    if (deleteConfirmText.trim() !== service.name.trim()) {
      toast.error("Введите точное название услуги для удаления");
      return;
    }
    removeService(service.id);
    toast.success("Услуга удалена из прайса");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Редактировать услугу" : "Добавить услугу"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <SearchAutocomplete
            label="Название услуги"
            value={name}
            onChange={setName}
            catalog={DENTAL_SERVICE_NAMES}
            placeholder="гигиена, имплант, коронка..."
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Категория</Label>
              <select
                className="flex h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--input-bg)] px-3 text-sm text-[var(--foreground)]"
                value={category}
                onChange={(e) => setCategory(e.target.value as ServiceCategory)}
              >
                {SERVICE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>{priceIsFrom ? "Цена от, ₽" : "Цена, ₽"}</Label>
              <Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
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
                      disabled={deleteConfirmText.trim() !== service.name.trim()}
                    >
                      Подтвердить удаление
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {UI.cancel}
            </Button>
            <Button onClick={handleSave}>{UI.save}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
