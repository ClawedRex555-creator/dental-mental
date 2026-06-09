"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Search } from "lucide-react";
import { ServiceModal } from "@/components/staff/service-modal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { canManageServices } from "@/lib/rbac";
import { groupServicesByCategory } from "@/lib/service-categories";
import { formatServicePrice, serviceNotes } from "@/lib/utils";
import type { Service } from "@/lib/types";
import { useClinicStore } from "@/store/useClinicStore";

export default function ServicesPage() {
  const { services, currentUser } = useClinicStore();
  const canEdit = canManageServices(currentUser.role);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);

  const q = search.trim().toLowerCase();

  const filteredByCategory = useMemo(
    () => groupServicesByCategory(services, q),
    [services, q]
  );

  const totalShown = filteredByCategory.reduce((n, g) => n + g.items.length, 0);

  const openAdd = () => {
    setEditingService(null);
    setModalOpen(true);
  };

  const openEdit = (service: Service) => {
    setEditingService(service);
    setModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Услуги</h1>
          <p className="text-sm text-slate-500">
            {canEdit ? "Прайс клиники по категориям" : "Прайс клиники — только просмотр"}
          </p>
        </div>
        {canEdit && (
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4" />
            Добавить услугу
          </Button>
        )}
      </div>

      <div className="relative max-w-lg">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          className="pl-9 text-base"
          placeholder="Поиск по названию во всех категориях..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {services.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-slate-500">
            {canEdit
              ? "Нет услуг. Добавьте первую — она понадобится в актах и планах лечения."
              : "Список услуг пока пуст. Обратитесь к администратору клиники."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {filteredByCategory.map(({ category, items, isLegacyCategory }) => {
            if (items.length === 0 && q) return null;
            return (
              <section key={category} className="space-y-3">
                <h2 className="text-lg font-semibold text-slate-900">
                  {category}
                  {canEdit && isLegacyCategory && (
                    <span className="ml-2 text-sm font-normal text-amber-700">
                      (переназначьте категорию в карточке услуги)
                    </span>
                  )}
                </h2>
                {items.length === 0 ? (
                  <p className="text-sm text-slate-400">Нет услуг в этой категории</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((service) => (
                      <Card key={service.id}>
                        <CardContent className="flex items-center justify-between gap-2 p-4">
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900">{service.name}</p>
                            <p className="text-sm text-teal-700">{formatServicePrice(service)}</p>
                            {serviceNotes(service) && (
                              <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                                {serviceNotes(service)}
                              </p>
                            )}
                          </div>
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEdit(service)}
                              title="Редактировать"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
          {q && totalShown === 0 && (
            <p className="text-center text-sm text-slate-500">Ничего не найдено по запросу «{search}»</p>
          )}
        </div>
      )}

      {canEdit && (
        <ServiceModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          service={editingService}
        />
      )}
    </div>
  );
}
