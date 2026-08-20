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
  /** Подсказка под полем; пустая строка — скрыть */
  hint?: string;
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
  hint,
}: SearchAutocompleteProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  useEffect(() => {
    return () => {
      if (blurTimer.current) clearTimeout(blurTimer.current);
    };
  }, []);

  const pick = (text: string) => {
    onChange(text);
    setOpen(false);
  };

  const closeSoon = () => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    // Даём время onMouseDown по пункту списка сработать до закрытия
    blurTimer.current = setTimeout(() => setOpen(false), 120);
  };

  const keepOpen = () => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
  };

  const onSuggestKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || !suggestions.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && suggestions[highlight]) {
      // Обычный Enter не подменяет текст — иначе при табе/сохранении имя «само» меняется
      e.preventDefault();
      pick(suggestions[highlight].label);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const inputClassName = cn(
    "w-full rounded-lg border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20",
    multiline && "min-h-[72px] resize-y"
  );

  const hintText =
    hint === undefined
      ? "Подсказки по каталогу — выберите кликом или Ctrl+Enter. Свой текст можно оставить как есть."
      : hint;

  return (
    <div ref={containerRef} className={cn("relative", compact ? "" : "space-y-2")}>
      {!compact && label && (
        <label className="text-sm font-medium text-[var(--foreground)]">
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
          onFocus={() => {
            keepOpen();
            setOpen(true);
          }}
          onBlur={closeSoon}
          onKeyDown={onSuggestKeyDown}
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
          onFocus={() => {
            keepOpen();
            setOpen(true);
          }}
          onBlur={closeSoon}
          onKeyDown={onSuggestKeyDown}
          autoComplete="off"
        />
      )}
      {showSuggestions && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--card)] py-1 shadow-lg"
          onMouseDown={keepOpen}
        >
          {suggestions.map((item, i) => (
            <li key={item.label}>
              <button
                type="button"
                role="option"
                tabIndex={-1}
                className={cn(
                  "w-full px-3 py-2 text-left text-sm text-[var(--foreground)] hover:bg-[var(--nav-hover-bg)] hover:text-[var(--nav-hover-fg)]",
                  i === highlight && "bg-[var(--nav-active-bg)] text-[var(--nav-active-fg)]"
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
      {!compact && hintText ? (
        <p className="text-xs text-[var(--muted)]">{hintText}</p>
      ) : null}
    </div>
  );
}
