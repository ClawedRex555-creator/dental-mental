"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { CatalogItem } from "@/lib/catalogs";
import { filterCatalog } from "@/lib/catalogs";
import { cn } from "@/lib/utils";

interface SearchAutocompleteProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  catalog: CatalogItem[];
  placeholder?: string;
  multiline?: boolean;
  required?: boolean;
  compact?: boolean;
}

export function SearchAutocomplete({
  label,
  value,
  onChange,
  catalog,
  placeholder,
  multiline = false,
  required,
  compact,
}: SearchAutocompleteProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const showSuggestions = open && value.trim().length > 0;
  const suggestions = filterCatalog(catalog, value);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    setHighlight(0);
  }, [value]);

  const pick = (text: string) => {
    onChange(text);
    setOpen(false);
  };

  const inputClassName = cn(
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20",
    multiline && "min-h-[72px] resize-y"
  );

  return (
    <div ref={containerRef} className={cn("relative", compact ? "" : "space-y-2")}>
      {!compact && label && (
        <label className="text-sm font-medium text-slate-700">
          {label}
          {required && " *"}
        </label>
      )}
      {multiline ? (
        <textarea
          className={inputClassName}
          value={value}
          placeholder={placeholder ?? "Начните вводить для поиска..."}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (!showSuggestions || !suggestions.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && suggestions[highlight]) {
              e.preventDefault();
              pick(suggestions[highlight].label);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          autoComplete="off"
        />
      ) : (
        <input
          type="text"
          className={inputClassName}
          value={value}
          placeholder={placeholder ?? "Начните вводить для поиска..."}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (!showSuggestions || !suggestions.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter" && suggestions[highlight]) {
              e.preventDefault();
              pick(suggestions[highlight].label);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          autoComplete="off"
        />
      )}
      {showSuggestions && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-[200] mt-1 max-h-48 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {suggestions.map((item, i) => (
            <li key={item.label}>
              <button
                type="button"
                role="option"
                tabIndex={-1}
                className={cn(
                  "w-full px-3 py-2 text-left text-sm hover:bg-teal-50",
                  i === highlight && "bg-teal-50 text-teal-900"
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(item.label);
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!compact && (
        <p className="text-xs text-slate-400">
          Введите ключевое слово — выберите из списка или допишите свой текст
        </p>
      )}
    </div>
  );
}
