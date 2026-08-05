"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Search } from "lucide-react";
import { ServiceModal } from "@/components/staff/service-modal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { canManageServices } from "@/lib/rbac";
import {
  getClinicBillableServices,
  getTechnicalServices,
  groupServicesByCategory,
  isTechnicalServiceCategory,
} from "@/lib/service-categories";
import { formatServicePrice, serviceNotes } from "@/lib/utils";
import type { Service } from "@/lib/types";
import { useClinicStore } from "@/store/useClinicStore";

export default function ServicesPage() {
  const { services, currentUser } = useClinicStore();
  const canEdit = canManageServices(currentUser.role);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [modalMode, setModalMode] = useState<"clinic" | "technical">("clinic");
  const [modalTechnicianName, setModalTechnicianName] = useState("");

  const q = search.trim().toLowerCase();
  const clinicServices = useMemo(
    () => getClinicBillableServices(services),
    [services]
  );
  const technicalServices = useMemo(
    () => getTechnicalServices(services),
    [services]
  );

  const filteredByCategory = useMemo(
    () => groupServicesByCategory(clinicServices, q),
    [clinicServices, q]
  );

  const filteredTechnical = useMemo(() => {
    if (!q) return technicalServices;
    return technicalServices.filter((service) => {
      const note = serviceNotes(service)?.toLowerCase() ?? "";
      return (
        service.name.toLowerCase().includes(q) ||
        (service.technicianName ?? "").toLowerCase().includes(q) ||
        (service.linkedClinicServiceName ?? "").toLowerCase().includes(q) ||
        note.includes(q) ||
        String(service.price).includes(q)
      );
    });
  }, [technicalServices, q]);

  const technicalByTechnician = useMemo(() => {
    const map = new Map<string, Service[]>();
    for (const service of filteredTechnical) {
      const key = service.technicianName?.trim() || "Без имени";
      const list = map.get(key) ?? [];
      list.push(service);
      map.set(key, list);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "ru"))
      .map(([technician, items]) => ({
        technician,
        items: items.sort((a, b) => a.name.localeCompare(b.name, "ru")),
      }));
  }, [filteredTechnical]);

  const totalShown =
    filteredByCategory.reduce((n, g) => n + g.items.length, 0) + filteredTechnical.length;

  const openAdd = () => {
    setEditingService(null);
    setModalMode("clinic");
    setModalTechnicianName("");
    setModalOpen(true);
  };

  const openAddTechnician = () => {
    setEditingService(null);
    setModalMode("technical");
    setModalTechnicianName("");
    setModalOpen(true);
  };

  const openAddTechnicalFor = (technicianName: string) => {
    setEditingService(null);
    setModalMode("technical");
    setModalTechnicianName(technicianName);
    setModalOpen(true);
  };

  const openEdit = (service: Service) => {
    setEditingService(service);
    setModalMode(isTechnicalServiceCategory(service.category) ? "technical" : "clinic");
    setModalTechnicianName(service.technicianName ?? "");
    setModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Услуги</h1>
          <p className="text-sm text-[var(--muted)]">
            {canEdit
              ? "Прайс клиники и технические прайсы по техникам"
              : "Прайс клиники — только просмотр"}
          </p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={openAddTechnician}>
              <Plus className="h-4 w-4" />
              Создать техника
            </Button>
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4" />
              Добавить услугу
            </Button>
          </div>
        )}
      </div>

      <div className="relative max-w-lg">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
        <Input
          className="pl-9 text-base"
          placeholder="Поиск по названию во всех категориях..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {services.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-[var(--muted)]">
            {canEdit
              ? "Нет услуг. Добавьте первую — она понадобится в актах и планах лечения."
              : "Список услуг пока пуст. Обратитесь к администратору клиники."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {filteredByCategory.map(({ category, items, isLegacyCategory }) => {
            if (items.length === 0) return null;
            return (
              <section key={category} className="space-y-3">
                <h2 className="text-lg font-semibold text-[var(--foreground)]">
                  {category}
                  {canEdit && isLegacyCategory && (
                    <span className="ml-2 text-sm font-normal text-amber-700 dark:text-amber-300">
                      (переназначьте категорию в карточке услуги)
                    </span>
                  )}
                </h2>
                {items.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">Нет услуг в этой категории</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((service) => (
                      <Card key={service.id}>
                        <CardContent className="flex items-center justify-between gap-2 p-4">
                          <div className="min-w-0">
                            <p className="font-medium text-[var(--foreground)]">{service.name}</p>
                            <p className="text-sm text-teal-700 dark:text-teal-300">
                              {formatServicePrice(service)}
                            </p>
                            {serviceNotes(service) && (
                              <p className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">
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
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-[var(--foreground)]">Техническая</h2>
              {canEdit && (
                <Button variant="outline" size="sm" onClick={openAddTechnician}>
                  <Plus className="h-4 w-4" />
                  Добавить техника
                </Button>
              )}
            </div>
            <p className="text-xs text-[var(--muted)]">
              В акте стоимость технички вычитается из услуги до расчёта ЗП врача и доли клиники.
            </p>
            {technicalByTechnician.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-center text-sm text-[var(--muted)]">
                  {q
                    ? "По запросу нет технических услуг"
                    : "Технические прайсы не добавлены"}
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {technicalByTechnician.map(({ technician, items }) => (
                  <Card key={technician}>
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-[var(--foreground)]">{technician}</p>
                        {canEdit && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openAddTechnicalFor(technician)}
                          >
                            <Plus className="h-4 w-4" />
                            Услуга
                          </Button>
                        )}
                      </div>
                      <div className="space-y-2">
                        {items.map((service) => (
                          <div
                            key={service.id}
                            className="flex items-start justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--input-readonly-bg)] px-3 py-2"
                          >
                            <div className="min-w-0">
                              <p className="font-medium text-[var(--foreground)]">
                                {service.linkedClinicServiceName?.trim() || service.name}
                              </p>
                              {serviceNotes(service) && (
                                <p className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">
                                  {serviceNotes(service)}
                                </p>
                              )}
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                                −{formatServicePrice(service)}
                              </p>
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
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>
          {q && totalShown === 0 && (
            <p className="text-center text-sm text-[var(--muted)]">
              Ничего не найдено по запросу «{search}»
            </p>
          )}
        </div>
      )}

      {canEdit && (
        <ServiceModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          service={editingService}
          createMode={modalMode}
          defaultTechnicianName={modalTechnicianName}
        />
      )}
    </div>
  );
}
