"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Service } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

function filterServices(services: Service[], query: string, limit = 20): Service[] {
  const q = query.trim().toLowerCase();
  if (!q) return services.slice(0, limit);
  return services
    .filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        String(s.price).includes(q)
    )
    .slice(0, limit);
}

interface ClinicServiceSearchProps {
  services: Service[];
  selectedServiceId?: string;
  onSelect: (service: Service) => void;
  label?: string;
  placeholder?: string;
  compact?: boolean;
}

export function ClinicServiceSearch({
  services,
  selectedServiceId,
  onSelect,
  label,
  placeholder = "Введите название или категорию...",
  compact,
}: ClinicServiceSearchProps) {
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const selected = services.find((s) => s.id === selectedServiceId);

  useEffect(() => {
    if (!open) {
      setQuery(selected?.name ?? "");
    }
  }, [selectedServiceId, selected?.name, open]);

  const suggestions = useMemo(
    () => filterServices(services, query),
    [services, query]
  );

  const showList = open && (query.trim().length > 0 || !selected);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery(selected?.name ?? "");
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [selected?.name]);

  useEffect(() => {
    setHighlight(0);
  }, [query]);

  const pick = (service: Service) => {
    onSelect(service);
    setQuery(service.name);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className={cn("relative", compact ? "" : "space-y-1")}>
      {label && !compact && (
        <label className="text-sm font-medium text-slate-700">{label}</label>
      )}
      <input
        type="text"
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
        value={open ? query : (selected?.name ?? query)}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setQuery(selected?.name ?? "");
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (!showList || !suggestions.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter" && suggestions[highlight]) {
            e.preventDefault();
            pick(suggestions[highlight]);
          } else if (e.key === "Escape") {
            setOpen(false);
            setQuery(selected?.name ?? "");
          }
        }}
        autoComplete="off"
        aria-autocomplete="list"
        aria-controls={listId}
      />
      {showList && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-[200] mt-1 max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {suggestions.map((service, i) => (
            <li key={service.id}>
              <button
                type="button"
                role="option"
                tabIndex={-1}
                className={cn(
                  "flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-teal-50",
                  i === highlight && "bg-teal-50"
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(service);
                }}
              >
                <span className="font-medium text-slate-900">{service.name}</span>
                <span className="text-xs text-slate-500">
                  {service.category} · {formatCurrency(service.price)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {showList && query.trim() && suggestions.length === 0 && (
        <p className="absolute left-0 right-0 top-full z-[200] mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 shadow-lg">
          Ничего не найдено
        </p>
      )}
      {!compact && (
        <p className="text-xs text-slate-400">Поиск по названию, категории или цене</p>
      )}
    </div>
  );
}
