"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { Service } from "@/lib/types";
import { DENTAL_SERVICE_NAMES, SERVICE_CATEGORIES, type ServiceCategory } from "@/lib/catalogs";
import { SearchAutocomplete } from "@/components/shared/search-autocomplete";
import { UI } from "@/lib/constants";
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

interface ServiceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service?: Service | null;
}

export function ServiceModal({ open, onOpenChange, service }: ServiceModalProps) {
  const { addService, updateService } = useClinicStore();
  const isEdit = !!service;
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ServiceCategory>(SERVICE_CATEGORIES[0]);
  const [price, setPrice] = useState("");
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
    } else {
      setName("");
      setCategory(SERVICE_CATEGORIES[0]);
      setPrice("");
    }
  }, [open, service]);

  const handleSave = () => {
    if (!name.trim() || !price.trim()) {
      toast.error("Заполните название и цену");
      return;
    }

    const payload = {
      name: name.trim(),
      category,
      price: Number(price) || 0,
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
                className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900"
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
              <Label>Цена, ₽</Label>
              <Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
          </div>
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
