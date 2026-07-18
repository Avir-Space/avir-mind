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

/**
 * Fits the viewport to all plotted aircraft whenever the set changes, and
 * re-invalidates + re-fits when the map container resizes (e.g. the drawer
 * opening compresses the canvas).
 */
function FitToFleet({ points }: { points: [number, number][] }) {
  const map = useMap();
  const fit = () => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0]!, 4);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 5, animate: false });
  };
  useEffect(() => {
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, map]);
  useEffect(() => {
    const el = map.getContainer();
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        map.invalidateSize({ animate: false });
        fit();
      });
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, points]);
  return null;
}

export default function FleetMap({ positions, onSelect }: Props) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light";

  const plotted = positions.filter(
    (p) => typeof p.lat === "number" && typeof p.lng === "number",
  );

  // Aircraft parked at the same station share identical coordinates, so their
  // CircleMarkers overlap exactly and only the topmost is clickable. Fan any
  // co-located group out into a small ring ("spiderfy") so every marker can be
  // clicked/hovered independently. ~0.55° ≈ visibly separated at the fleet's
  // fit zoom while staying near the true location.
  const groups = new Map<string, AircraftPosition[]>();
  for (const p of plotted) {
    const key = `${(p.lat as number).toFixed(2)},${(p.lng as number).toFixed(2)}`;
    const g = groups.get(key);
    if (g) g.push(p);
    else groups.set(key, [p]);
  }
  const displayLatLng = new Map<string, [number, number]>();
  for (const group of groups.values()) {
    if (group.length === 1) {
      const p = group[0]!;
      displayLatLng.set(p.aircraft_id, [p.lat as number, p.lng as number]);
      continue;
    }
    const ring = 0.55 + group.length * 0.05;
    group.forEach((p, i) => {
      const angle = (2 * Math.PI * i) / group.length;
      displayLatLng.set(p.aircraft_id, [
        (p.lat as number) + ring * Math.sin(angle),
        (p.lng as number) + ring * Math.cos(angle),
      ]);
    });
  }
  const coord = (p: AircraftPosition): [number, number] =>
    displayLatLng.get(p.aircraft_id) ?? [p.lat as number, p.lng as number];
  const points = plotted.map((p) => coord(p));

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
            center={coord(p)}
            radius={meta.radius}
            pathOptions={{
              color: meta.hex,
              weight: meta.emphasis ? 2.5 : 1.5,
              fillColor: meta.hex,
              fillOpacity: 0.85,
            }}
            bubblingMouseEvents={false}
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
