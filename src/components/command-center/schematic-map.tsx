"use client";

import { useState } from "react";

import { canvasState } from "@/lib/design/command-center";
import type { AircraftPosition } from "@/types/command-center";

type Props = {
  positions: AircraftPosition[];
  onSelect: (p: AircraftPosition) => void;
};

// Equirectangular projection into a 0..100 fractional space.
const px = (lng: number) => ((lng + 180) / 360) * 100;
const py = (lat: number) => ((90 - lat) / 180) * 100;

/**
 * Stylized "schematic" world — a graticule with plotted aircraft, no OSM tile
 * detail. For operators who want less visual noise than the live map.
 */
export default function SchematicMap({ positions, onSelect }: Props) {
  const [hover, setHover] = useState<AircraftPosition | null>(null);
  const plotted = positions.filter((p) => typeof p.lat === "number" && typeof p.lng === "number");

  const meridians = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150];
  const parallels = [-60, -30, 0, 30, 60];

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0a0a0f] dark:bg-[#0a0a0f]">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {/* graticule */}
        {meridians.map((m) => (
          <line key={`m${m}`} x1={px(m)} y1={0} x2={px(m)} y2={100} stroke="#ffffff" strokeOpacity={0.05} strokeWidth={0.15} />
        ))}
        {parallels.map((p) => (
          <line key={`p${p}`} x1={0} y1={py(p)} x2={100} y2={py(p)} stroke="#ffffff" strokeOpacity={0.05} strokeWidth={0.15} />
        ))}
        {/* equator + prime meridian, brighter */}
        <line x1={0} y1={py(0)} x2={100} y2={py(0)} stroke="#1019EC" strokeOpacity={0.25} strokeWidth={0.2} />
        <line x1={px(0)} y1={0} x2={px(0)} y2={100} stroke="#1019EC" strokeOpacity={0.18} strokeWidth={0.2} />
      </svg>

      {/* aircraft markers as positioned HTML so tooltips are easy */}
      {plotted.map((p) => {
        const meta = canvasState(p.state);
        const size = meta.emphasis ? 12 : 9;
        return (
          <button
            key={p.aircraft_id}
            type="button"
            onClick={() => onSelect(p)}
            onMouseEnter={() => setHover(p)}
            onMouseLeave={() => setHover((h) => (h?.aircraft_id === p.aircraft_id ? null : h))}
            className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer"
            style={{ left: `${px(p.lng as number)}%`, top: `${py(p.lat as number)}%` }}
            aria-label={`${p.tail_number} — ${meta.label}`}
          >
            <span
              className="block rounded-full ring-1 ring-black/40"
              style={{ width: size, height: size, background: meta.hex, boxShadow: `0 0 8px ${meta.hex}66` }}
            />
          </button>
        );
      })}

      {/* hover tooltip */}
      {hover && typeof hover.lng === "number" && typeof hover.lat === "number" && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full border border-border bg-card px-2 py-1.5 text-foreground shadow-lg"
          style={{ left: `${px(hover.lng)}%`, top: `calc(${py(hover.lat)}% - 8px)` }}
        >
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] font-medium">{hover.tail_number}</span>
            <span className="text-[9px] uppercase tracking-wider" style={{ color: canvasState(hover.state).hex }}>
              {canvasState(hover.state).label}
            </span>
          </div>
          <div className="mt-0.5 font-mono text-[9px] text-hint">
            {hover.aircraft_type}
            {hover.station ? ` · ${hover.station}` : ""}
            {hover.active_signals_count > 0 ? ` · ${hover.active_signals_count} sig` : ""}
          </div>
        </div>
      )}
    </div>
  );
}
