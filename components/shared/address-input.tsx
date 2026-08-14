"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  collectKnownAddresses,
  filterKnownAddresses,
  mergeAddressSuggestions,
  type AddressSuggestion,
} from "@/lib/address-suggest";
import { cn } from "@/lib/utils";

interface AddressInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Уже сохранённые адреса (пациенты / клиника) — подсказки без DaData */
  knownAddresses?: Array<string | undefined | null>;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export function AddressInput({
  value,
  onChange,
  knownAddresses = [],
  placeholder = "Город, улица, дом, квартира",
  disabled = false,
  className,
  id,
}: AddressInputProps) {
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [remote, setRemote] = useState<AddressSuggestion[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const known = useMemo(() => collectKnownAddresses(knownAddresses), [knownAddresses]);
  const local = useMemo(() => filterKnownAddresses(known, value), [known, value]);
  const suggestions = useMemo(
    () => mergeAddressSuggestions(local, remote),
    [local, remote]
  );

  const showList = open && !disabled && value.trim().length >= 2 && suggestions.length > 0;

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    setHighlight(0);
  }, [suggestions]);

  useEffect(() => {
    const q = value.trim();
    abortRef.current?.abort();
    if (q.length < 2 || disabled) {
      setRemote([]);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(
            `/api/address-suggest?q=${encodeURIComponent(q)}`,
            { signal: controller.signal, credentials: "same-origin" }
          );
          if (!res.ok) {
            setRemote([]);
            return;
          }
          const data = (await res.json()) as { suggestions?: AddressSuggestion[] };
          if (controller.signal.aborted) return;
          setRemote(
            (data.suggestions ?? []).filter((s) => s?.value).map((s) => ({
              value: s.value,
              source: "dadata" as const,
            }))
          );
        } catch (err) {
          if ((err as { name?: string })?.name === "AbortError") return;
          setRemote([]);
        }
      })();
    }, 280);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value, disabled]);

  const pick = (text: string) => {
    onChange(text);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        id={id}
        type="text"
        disabled={disabled}
        autoComplete="street-address"
        className={cn(
          "flex h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] focus-visible:ring-2 focus-visible:ring-teal-500 disabled:cursor-not-allowed disabled:bg-[var(--input-readonly-bg)] disabled:text-[var(--muted)]",
          className
        )}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (!disabled) setOpen(true);
        }}
        onKeyDown={(e) => {
          if (!showList) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter" && suggestions[highlight]) {
            e.preventDefault();
            pick(suggestions[highlight].value);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={showList}
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-[200] mt-1 max-h-56 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--card)] py-1 shadow-lg"
        >
          {suggestions.map((item, i) => {
            const isActive = i === highlight;
            return (
              <li key={`${item.source}:${item.value}`}>
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
                    pick(item.value);
                  }}
                >
                  <span
                    className={cn(
                      "font-medium",
                      isActive ? "text-[var(--nav-active-fg)]" : "text-[var(--foreground)]"
                    )}
                  >
                    {item.value}
                  </span>
                  {item.source === "local" && (
                    <span
                      className={cn(
                        "text-xs",
                        isActive
                          ? "text-[var(--nav-active-fg)] opacity-80"
                          : "text-[var(--muted)]"
                      )}
                    >
                      Из карточек пациентов
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
