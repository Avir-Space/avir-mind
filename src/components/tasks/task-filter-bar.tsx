"use client";

import { Search } from "lucide-react";

import { cn } from "@/lib/utils";

/** Horizontal filter bar container. Composed with the primitives below. */
export function TaskFilterBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-border px-6 py-3">
      {children}
    </div>
  );
}

export function FilterLabel({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-eyebrow uppercase text-label">{children}</span>;
}

type Option = { value: string; label: string };

/** Multi-select chip group. */
export function FilterChipGroup({
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
  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);

  return (
    <div className="flex items-center gap-2" data-testid={`filter-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <FilterLabel>{label}</FilterLabel>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => {
          const active = selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => toggle(o.value)}
              className={cn(
                "border px-2 py-0.5 text-xs transition-colors duration-micro",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-subtext hover:text-foreground",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Single-select segmented control. */
export function FilterSegmented({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: Option[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2" data-testid={label ? `filter-${label.toLowerCase().replace(/\s+/g, "-")}` : undefined}>
      {label && <FilterLabel>{label}</FilterLabel>}
      <div className="inline-flex border border-border">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "border-r border-border px-2.5 py-0.5 text-xs transition-colors duration-micro last:border-r-0",
              value === o.value ? "bg-primary text-primary-foreground" : "text-subtext hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Boolean toggle chip. */
export function FilterToggle({
  label,
  active,
  onChange,
}: {
  label: string;
  active: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!active)}
      className={cn(
        "border px-2.5 py-0.5 text-xs font-medium transition-colors duration-micro",
        active ? "border-primary bg-primary text-primary-foreground" : "border-border text-subtext hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

/** Inline search input for the filter bar. */
export function FilterSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-hint" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Search"}
        className="h-7 w-52 border border-input bg-transparent pl-8 pr-2 text-xs text-foreground placeholder:text-hint focus:border-primary focus:outline-none"
      />
    </div>
  );
}
