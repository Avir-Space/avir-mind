"use client";

import dynamic from "next/dynamic";
import { Globe, Map as MapIcon } from "lucide-react";
import { useState } from "react";

import { CANVAS_STATE } from "@/lib/design/command-center";
import { cn } from "@/lib/utils";
import type { AircraftPosition } from "@/types/command-center";

const FleetMap = dynamic(() => import("./fleet-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#0a0a0f] text-xs text-hint">
      Loading map…
    </div>
  ),
});
const SchematicMap = dynamic(() => import("./schematic-map"), { ssr: false });

const LEGEND: { key: keyof typeof CANVAS_STATE; }[] = [
  { key: "in_air" },
  { key: "on_ground" },
  { key: "under_maintenance" },
  { key: "aog" },
];

export function MapPanel({
  positions,
  onSelect,
}: {
  positions: AircraftPosition[];
  onSelect: (p: AircraftPosition) => void;
}) {
  const [mode, setMode] = useState<"map" | "schematic">("map");
  const plotted = positions.filter((p) => typeof p.lat === "number").length;

  return (
    <div className="relative h-full w-full">
      {mode === "map" ? (
        <FleetMap positions={positions} onSelect={onSelect} />
      ) : (
        <SchematicMap positions={positions} onSelect={onSelect} />
      )}

      {/* Map / Schematic toggle — top-right */}
      <div className="absolute right-3 top-3 z-[500] inline-flex border border-border bg-page/90 backdrop-blur">
        <button
          type="button"
          onClick={() => setMode("map")}
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs transition-colors",
            mode === "map" ? "bg-primary text-primary-foreground" : "text-subtext hover:text-foreground",
          )}
        >
          <MapIcon className="h-3.5 w-3.5" /> Map
        </button>
        <button
          type="button"
          onClick={() => setMode("schematic")}
          className={cn(
            "inline-flex items-center gap-1.5 border-l border-border px-2.5 py-1 text-xs transition-colors",
            mode === "schematic" ? "bg-primary text-primary-foreground" : "text-subtext hover:text-foreground",
          )}
        >
          <Globe className="h-3.5 w-3.5" /> Schematic
        </button>
      </div>

      {/* Legend + count — bottom-left */}
      <div className="absolute bottom-3 left-3 z-[500] flex flex-wrap items-center gap-x-3 gap-y-1 border border-border bg-page/90 px-2.5 py-1.5 backdrop-blur">
        {LEGEND.map(({ key }) => {
          const m = CANVAS_STATE[key]!;
          return (
            <span key={key} className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-label">
              <span className="h-2 w-2 rounded-full" style={{ background: m.hex }} />
              {m.label}
            </span>
          );
        })}
        <span className="font-mono text-[10px] uppercase tracking-wider text-hint">· {plotted} plotted</span>
      </div>
    </div>
  );
}
