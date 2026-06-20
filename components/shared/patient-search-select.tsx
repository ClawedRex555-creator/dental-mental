"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Patient } from "@/lib/types";
import { filterPatientsByQuery } from "@/lib/patient-search";
import { formatPhone, getFullName } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface PatientSearchSelectProps {
  patients: Patient[];
  selectedPatientId?: string;
  onSelect: (patient: Patient) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
}

export function PatientSearchSelect({
  patients,
  selectedPatientId,
  onSelect,
  label,
  placeholder = "ФИО или телефон...",
  disabled = false,
}: PatientSearchSelectProps) {
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const selected = patients.find((p) => p.id === selectedPatientId);

  const displayLabel = selected
    ? getFullName(selected.firstName, selected.lastName, selected.middleName)
    : "";

  const suggestions = useMemo(
    () => filterPatientsByQuery(patients, query),
    [patients, query]
  );

  const showList = open && !disabled && (query.trim().length > 0 || !selected);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery(displayLabel);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [displayLabel]);

  const pick = (patient: Patient) => {
    onSelect(patient);
    setQuery(getFullName(patient.firstName, patient.lastName, patient.middleName));
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative min-w-0 flex-1 space-y-1">
      {label && (
        <label className="text-sm font-medium text-[var(--foreground)]">{label}</label>
      )}
      <input
        type="text"
        disabled={disabled}
        className={cn(
          "w-full rounded-lg border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20",
          disabled && "opacity-60"
        )}
        value={open ? query : displayLabel || query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlight(0);
          setOpen(true);
        }}
        onFocus={() => {
          if (disabled) return;
          setQuery(displayLabel);
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
            setQuery(displayLabel);
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
          className="absolute left-0 right-0 top-full z-[200] mt-1 max-h-56 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--card)] py-1 shadow-lg"
        >
          {suggestions.map((patient, i) => {
            const isActive = i === highlight;
            return (
            <li key={patient.id}>
              <button
                type="button"
                role="option"
                aria-selected={isActive}
                tabIndex={-1}
                className={cn(
                  "flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-[var(--nav-hover-bg)]",
                  isActive && "bg-[var(--nav-active-bg)]"
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(patient);
                }}
              >
                <span
                  className={cn(
                    "font-medium",
                    isActive ? "text-[var(--nav-active-fg)]" : "text-[var(--foreground)]"
                  )}
                >
                  {getFullName(patient.firstName, patient.lastName, patient.middleName)}
                </span>
                <span
                  className={cn(
                    "text-xs",
                    isActive
                      ? "text-[var(--nav-active-fg)] opacity-80"
                      : "text-[var(--muted)]"
                  )}
                >
                  {formatPhone(patient.phone)}
                  {patient.email ? ` · ${patient.email}` : ""}
                </span>
              </button>
            </li>
            );
          })}
        </ul>
      )}
      {showList && query.trim() && suggestions.length === 0 && (
        <p className="absolute left-0 right-0 top-full z-[200] mt-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--muted)] shadow-lg">
          Пациент не найден
        </p>
      )}
    </div>
  );
}
