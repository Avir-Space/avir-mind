"use client";

import { useEffect, useMemo, useState } from "react";

import { canvasState, SEVERITY_HEX } from "@/lib/design/command-center";
import { cn } from "@/lib/utils";
import type { AircraftPosition, TimelineEvent } from "@/types/command-center";

const LABEL_W = "8rem"; // 128px sticky label column
const LOOKBACK_MIN = 60; // small margin left of "now"

type Row = {
  aircraftId: string;
  tail: string;
  type: string;
  state: string;
  station: string | null;
  events: TimelineEvent[];
};

type Leg = { left: number; width: number; label: string; status?: string };

/** Ticks itself once a second so the now-line visibly advances. */
function NowLine({ startMs, durationMs }: { startMs: number; durationMs: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const frac = Math.min(Math.max((now - startMs) / durationMs, 0), 1);
  return (
    <div
      className="pointer-events-none absolute inset-y-0 z-20 w-px bg-primary"
      style={{ left: `calc(${LABEL_W} + (100% - ${LABEL_W}) * ${frac})` }}
    >
      <span className="absolute -top-[7px] -left-[3px] h-[7px] w-[7px] rotate-45 bg-primary" />
    </div>
  );
}

export function OpsTimeline({
  positions,
  events,
  windowHours,
  now,
  onEventClick,
}: {
  positions: AircraftPosition[];
  events: TimelineEvent[];
  windowHours: number;
  now: number;
  onEventClick: (e: TimelineEvent) => void;
}) {
  const [groupByStation, setGroupByStation] = useState(false);

  const startMs = now - LOOKBACK_MIN * 60_000;
  const durationMs = (windowHours * 60 + LOOKBACK_MIN) * 60_000;
  const frac = (t: number) => Math.min(Math.max((t - startMs) / durationMs, 0), 1);

  const rows: Row[] = useMemo(() => {
    const map = new Map<string, Row>();
    for (const p of positions) {
      map.set(p.aircraft_id, {
        aircraftId: p.aircraft_id,
        tail: p.tail_number,
        type: p.aircraft_type,
        state: p.state,
        station: p.station,
        events: [],
      });
    }
    for (const e of events) {
      const row = map.get(e.aircraft_id);
      if (row) row.events.push(e);
    }
    return [...map.values()].sort((a, b) => a.tail.localeCompare(b.tail));
  }, [positions, events]);

  // Hour ticks across the window.
  const ticks = useMemo(() => {
    const out: { left: number; label: string }[] = [];
    const first = new Date(startMs);
    first.setMinutes(0, 0, 0);
    let t = first.getTime();
    if (t < startMs) t += 3_600_000;
    for (; t <= startMs + durationMs; t += 3_600_000) {
      out.push({
        left: frac(t),
        label: new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startMs, durationMs]);

  function legsFor(row: Row): Leg[] {
    const deps = row.events.filter((e) => e.event_type === "departure");
    const arrs = row.events.filter((e) => e.event_type === "arrival");
    const used = new Set<number>();
    const legs: Leg[] = [];
    for (const d of deps) {
      const depT = new Date(d.event_time_utc).getTime();
      const fn = d.event_detail_json.flight_number ?? "";
      const ai = arrs.findIndex(
        (a, i) => !used.has(i) && (a.event_detail_json.flight_number ?? "") === fn && new Date(a.event_time_utc).getTime() >= depT,
      );
      const left = frac(depT);
      let right = Math.min(left + 0.06, 1);
      if (ai >= 0) {
        used.add(ai);
        right = frac(new Date(arrs[ai]!.event_time_utc).getTime());
      }
      legs.push({
        left,
        width: Math.max(right - left, 0.012),
        label: `${d.event_detail_json.origin ?? ""}→${d.event_detail_json.destination ?? ""}`,
        status: d.event_detail_json.status,
      });
    }
    return legs;
  }

  const grouped: { station: string; rows: Row[] }[] = useMemo(() => {
    if (!groupByStation) return [];
    const g = new Map<string, Row[]>();
    for (const r of rows) {
      const key = r.station ?? "—";
      (g.get(key) ?? g.set(key, []).get(key)!).push(r);
    }
    return [...g.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([station, rs]) => ({ station, rows: rs }));
  }, [groupByStation, rows]);

  function renderRow(row: Row) {
    const meta = canvasState(row.state);
    const legs = legsFor(row);
    const signals = row.events.filter((e) => e.event_type === "signal");
    return (
      <div key={row.aircraftId} className="flex h-8 items-stretch border-b border-border/60">
        {/* label */}
        <div className="flex w-32 shrink-0 items-center gap-2 border-r border-border px-2">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: meta.hex }} />
          <span className="truncate font-mono text-[11px] text-foreground">{row.tail}</span>
        </div>
        {/* track */}
        <div className="relative flex-1">
          {/* flight legs */}
          {legs.map((leg, i) => (
            <div
              key={i}
              className="absolute top-1/2 flex h-3.5 -translate-y-1/2 items-center overflow-hidden border border-primary/60 bg-primary/20 px-1"
              style={{ left: `${leg.left * 100}%`, width: `${leg.width * 100}%` }}
              title={leg.label}
            >
              <span className="truncate font-mono text-[9px] text-primary">{leg.label}</span>
            </div>
          ))}
          {/* signal markers */}
          {signals.map((s, i) => {
            const hex = SEVERITY_HEX[s.event_detail_json.severity ?? "info"] ?? SEVERITY_HEX.info;
            return (
              <button
                key={i}
                type="button"
                onClick={() => onEventClick(s)}
                className="absolute top-1/2 z-10 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-black/30"
                style={{ left: `${frac(new Date(s.event_time_utc).getTime()) * 100}%`, background: hex }}
                title={s.event_detail_json.title ?? "Signal"}
                aria-label={s.event_detail_json.title ?? "Signal"}
              />
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* header: title + grouping toggle */}
      <div className="flex items-center justify-between border-b border-border px-6 py-1.5">
        <span className="font-mono text-eyebrow uppercase tracking-wider text-label">
          Operational Timeline · next {windowHours}h
        </span>
        <div className="inline-flex border border-border">
          <button
            type="button"
            onClick={() => setGroupByStation(false)}
            className={cn("px-2 py-0.5 text-[11px]", !groupByStation ? "bg-primary text-primary-foreground" : "text-subtext hover:text-foreground")}
          >
            Aircraft
          </button>
          <button
            type="button"
            onClick={() => setGroupByStation(true)}
            className={cn("border-l border-border px-2 py-0.5 text-[11px]", groupByStation ? "bg-primary text-primary-foreground" : "text-subtext hover:text-foreground")}
          >
            Station
          </button>
        </div>
      </div>

      {/* axis */}
      <div className="relative flex h-6 shrink-0 items-center border-b border-border">
        <div className="w-32 shrink-0 border-r border-border" />
        <div className="relative h-full flex-1">
          {ticks.map((t, i) => (
            <span
              key={i}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 font-mono text-[9px] text-hint"
              style={{ left: `${t.left * 100}%` }}
            >
              {t.label}
            </span>
          ))}
        </div>
      </div>

      {/* rows + now-line */}
      <div className="relative flex-1 overflow-y-auto avir-scroll">
        <NowLine startMs={startMs} durationMs={durationMs} />
        {rows.length === 0 ? (
          <div className="flex h-full items-center px-6 text-xs text-hint">No aircraft in view.</div>
        ) : groupByStation ? (
          grouped.map((g) => (
            <div key={g.station}>
              <div className="sticky top-0 z-10 border-b border-border bg-surface/80 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-label backdrop-blur">
                {g.station} · {g.rows.length}
              </div>
              {g.rows.map(renderRow)}
            </div>
          ))
        ) : (
          rows.map(renderRow)
        )}
      </div>
    </div>
  );
}
