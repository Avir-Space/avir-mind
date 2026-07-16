"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useTheme } from "next-themes";
import { useEffect } from "react";
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet";

import { canvasState } from "@/lib/design/command-center";
import type { AircraftPosition } from "@/types/command-center";

type Props = {
  positions: AircraftPosition[];
  onSelect: (p: AircraftPosition) => void;
};

/** Fits the viewport to all plotted aircraft whenever the set changes. */
function FitToFleet({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0]!, 4);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 5, animate: false });
  }, [points, map]);
  return null;
}

export default function FleetMap({ positions, onSelect }: Props) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light";

  const plotted = positions.filter(
    (p) => typeof p.lat === "number" && typeof p.lng === "number",
  );
  const points = plotted.map((p) => [p.lat as number, p.lng as number] as [number, number]);

  const tileUrl = dark
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

  return (
    <MapContainer
      center={[30, 0]}
      zoom={2}
      minZoom={1}
      worldCopyJump
      zoomControl={false}
      attributionControl={false}
      style={{ height: "100%", width: "100%", background: dark ? "#0a0a0f" : "#e8ecf1" }}
    >
      <TileLayer
        url={tileUrl}
        subdomains="abcd"
        attribution='&copy; OpenStreetMap &copy; CARTO'
      />
      <FitToFleet points={points} />
      {plotted.map((p) => {
        const meta = canvasState(p.state);
        return (
          <CircleMarker
            key={p.aircraft_id}
            center={[p.lat as number, p.lng as number]}
            radius={meta.radius}
            pathOptions={{
              color: meta.hex,
              weight: meta.emphasis ? 2.5 : 1.5,
              fillColor: meta.hex,
              fillOpacity: 0.85,
            }}
            eventHandlers={{ click: () => onSelect(p) }}
          >
            <Tooltip direction="top" offset={[0, -4]} opacity={1} className="avir-map-tooltip">
              <div className="min-w-[150px] font-sans">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[12px] font-medium">{p.tail_number}</span>
                  <span className="text-[10px] uppercase tracking-wider" style={{ color: meta.hex }}>
                    {meta.label}
                  </span>
                </div>
                <div className="mt-0.5 text-[10px] opacity-70">
                  {p.aircraft_type}
                  {p.station ? ` · ${p.station}` : ""}
                </div>
                {p.active_signals_count > 0 && (
                  <div className="mt-1 text-[10px]">
                    {p.active_signals_count} active signal{p.active_signals_count === 1 ? "" : "s"}
                  </div>
                )}
                {p.primary_task_title && (
                  <div className="mt-1 max-w-[220px] truncate text-[10px] opacity-80">
                    {p.primary_task_title}
                  </div>
                )}
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
