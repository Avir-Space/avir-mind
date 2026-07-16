"use client";

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
  if (rollups.length === 0) {
    return (
      <div className="flex h-full items-center px-6 text-xs text-hint">
        No stations with aircraft in view.
      </div>
    );
  }

  return (
    <div className="flex h-full items-stretch gap-2 overflow-x-auto avir-scroll px-6 py-2">
      {rollups.map((r) => {
        const active = selected === r.station_code;
        const hasSignals = r.active_signals_count > 0;
        const hasBlocking = r.dispatch_blocking_count > 0;
        return (
          <button
            key={r.station_code}
            type="button"
            onClick={() => onSelect(active ? null : r.station_code)}
            className={cn(
              "flex min-w-[168px] shrink-0 flex-col border bg-card px-3 py-2 text-left transition-colors",
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
              <span
                className={cn(
                  "inline-flex items-center gap-1 font-mono text-[10px]",
                  hasSignals ? "text-severity-high" : "text-hint",
                )}
              >
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
  );
}
