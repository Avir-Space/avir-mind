"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type Option = { value: string; label: string };

/**
 * Compact multi-select filter dropdown — zero radius, checkboxes, search when
 * there are many options, select-all/clear, applies on click-outside (no Apply
 * button). The trigger summarizes the current selection.
 */
export function FilterDropdown({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const summary =
    selected.length === 0
      ? "All"
      : selected.length <= 2
        ? options.filter((o) => selected.includes(o.value)).map((o) => o.label).join(", ")
        : `${selected.length} selected`;

  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);

  const searchable = options.length > 8;
  const filtered = searchable && query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-9 min-w-[140px] items-center justify-between gap-2 border px-2.5 text-xs transition-colors",
          selected.length ? "border-primary text-foreground" : "border-border text-subtext hover:text-foreground",
        )}
      >
        <span className="flex items-center gap-1.5">
          <span className="font-mono uppercase tracking-wider text-label">{label}</span>
          <span className="max-w-[120px] truncate">{summary}</span>
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-50 w-60 border border-border bg-card shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-2.5 py-1.5">
            <button type="button" onClick={() => onChange(options.map((o) => o.value))} className="text-[11px] text-primary hover:underline">
              Select all
            </button>
            <button type="button" onClick={() => onChange([])} className="text-[11px] text-label hover:text-foreground">
              Clear
            </button>
          </div>
          {searchable && (
            <div className="relative border-b border-border">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-hint" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="h-8 w-full bg-transparent pl-8 pr-2 text-xs text-foreground placeholder:text-hint focus:outline-none"
              />
            </div>
          )}
          <ul className="max-h-56 overflow-y-auto avir-scroll py-1">
            {filtered.map((o) => {
              const on = selected.includes(o.value);
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    onClick={() => toggle(o.value)}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-body transition-colors hover:bg-surface/60"
                  >
                    <span className={cn("flex h-3.5 w-3.5 shrink-0 items-center justify-center border", on ? "border-primary bg-primary text-primary-foreground" : "border-border-strong")}>
                      {on && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                    </span>
                    {o.label}
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 && <li className="px-2.5 py-2 text-xs text-hint">No matches</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
