"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import type { StationRollup } from "@/types/command-center";

export function StationStrip({
  rollups,
  selected,
  onSelect,
}: {
  rollups: StationRollup[];
  selected: string | null;
  onSelect: (station: string | null) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    update();
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [update, rollups.length]);

  const scrollBy = (dx: number) => scroller.current?.scrollBy({ left: dx, behavior: "smooth" });

  if (rollups.length === 0) {
    return (
      <div className="flex h-full items-center px-6 text-xs text-hint">
        No stations with aircraft in view.
      </div>
    );
  }

  return (
    <div className="relative flex h-full items-center">
      {/* Clear-filter chip */}
      {selected && (
        <div className="flex h-full shrink-0 items-center border-r border-border pl-6 pr-3">
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="inline-flex items-center gap-1 border border-primary px-2 py-1 font-mono text-[11px] text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
          >
            {selected} <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Left chevron + fade */}
      {canLeft && (
        <>
          <div className={cn("pointer-events-none absolute inset-y-0 z-10 w-10 bg-gradient-to-r from-page to-transparent", selected ? "left-[92px]" : "left-0")} />
          <button
            type="button"
            onClick={() => scrollBy(-360)}
            aria-label="Scroll stations left"
            className="absolute left-1 z-20 flex h-6 w-6 items-center justify-center border border-border bg-page/90 text-label backdrop-blur transition-colors hover:text-foreground"
            style={selected ? { left: "96px" } : undefined}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </>
      )}

      <div
        ref={scroller}
        onScroll={update}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") { e.preventDefault(); scrollBy(200); }
          else if (e.key === "ArrowLeft") { e.preventDefault(); scrollBy(-200); }
        }}
        tabIndex={0}
        role="listbox"
        aria-label="Stations"
        className="flex h-full snap-x snap-mandatory items-stretch gap-3 overflow-x-auto avir-scroll px-6 py-2 focus:outline-none focus-visible:ring-1 focus-visible:ring-primary"
      >
        {rollups.map((r) => {
          const active = selected === r.station_code;
          const hasSignals = r.active_signals_count > 0;
          const hasBlocking = r.dispatch_blocking_count > 0;
          return (
            <button
              key={r.station_code}
              type="button"
              role="option"
              aria-selected={active}
              onClick={() => onSelect(active ? null : r.station_code)}
              className={cn(
                "flex w-[180px] shrink-0 snap-start flex-col border bg-card px-3 py-2 text-left transition-colors",
                active ? "border-primary" : "border-border hover:border-border-strong",
              )}
            >
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-lg leading-none text-foreground">{r.station_code}</span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-hint">
                  {r.aircraft_on_ground}g · {r.aircraft_inbound}in
                </span>
              </div>
              <div className="mt-1.5 font-mono text-[10px] uppercase tracking-wider text-hint">Weather: —</div>
              <div className="mt-2 flex items-center gap-2">
                <span className={cn("inline-flex items-center gap-1 font-mono text-[10px]", hasSignals ? "text-severity-high" : "text-hint")}>
                  <span className={cn("severity-dot", hasSignals ? "bg-severity-high" : "bg-border-strong")} />
                  {r.active_signals_count} sig
                </span>
                {hasBlocking && (
                  <span className="inline-flex items-center gap-1 font-mono text-[10px] text-severity-critical">
                    <span className="severity-dot bg-severity-critical" />
                    {r.dispatch_blocking_count} blk
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Right chevron + fade */}
      {canRight && (
        <>
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-page to-transparent" />
          <button
            type="button"
            onClick={() => scrollBy(360)}
            aria-label="Scroll stations right"
            className="absolute right-1 z-20 flex h-6 w-6 items-center justify-center border border-border bg-page/90 text-label backdrop-blur transition-colors hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  );
}
