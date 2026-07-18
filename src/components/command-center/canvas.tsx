"use client";

import { Radio, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { CanvasDrawer } from "@/components/command-center/canvas-drawer";
import { LiveClock } from "@/components/command-center/live-clock";
import { MapPanel } from "@/components/command-center/map-panel";
import { OpsTimeline } from "@/components/command-center/ops-timeline";
import { StationStrip } from "@/components/command-center/station-strip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TIME_WINDOWS, type TimeWindowValue } from "@/lib/design/command-center";
import { flightCategory, flightEventLabel } from "@/lib/design/flightops";
import { useCommandCenterSnapshot } from "@/lib/queries/use-command-center-snapshot";
import { useCrewOverlay } from "@/lib/queries/use-crew";
import { useWeatherOverlay, useRecentFlightEvents } from "@/lib/queries/use-flightops";
import { useFleets } from "@/lib/queries/use-fleets";
import { useTaskRealtime } from "@/lib/realtime/use-task-realtime";
import { useSignalRealtime } from "@/lib/realtime/use-signal-realtime";
import { useAuth } from "@/lib/providers/auth-provider";
import { cn } from "@/lib/utils";
import type { DrawerTarget } from "@/types/command-center";

export function CommandCenterCanvas() {
  const { orgId } = useAuth();
  useTaskRealtime(orgId);
  useSignalRealtime(orgId);

  const { data: fleets } = useFleets();
  const [fleetId, setFleetId] = useState("all");
  const [win, setWin] = useState<TimeWindowValue>("12h");
  const [station, setStation] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<DrawerTarget>(null);
  const [pinned, setPinned] = useState(false);
  const [crewOn, setCrewOn] = useState(false);
  const [wxOn, setWxOn] = useState(false);
  const [eventsOn, setEventsOn] = useState(false);

  const hours = TIME_WINDOWS.find((w) => w.value === win)?.hours ?? 12;
  const { data: snapshot, isLoading } = useCommandCenterSnapshot(
    fleetId === "all" ? null : fleetId,
    hours,
  );
  const { data: crewOverlay } = useCrewOverlay(fleetId === "all" ? null : fleetId, crewOn);
  const crewStatus = new Map((crewOverlay?.aircraft ?? []).map((a) => [a.aircraft_id, a.crew_status]));
  const crewByStation = new Map((crewOverlay?.stations ?? []).map((s) => [s.station_code, s.crew_available]));
  const { data: wxOverlay } = useWeatherOverlay(wxOn);
  const wxByStation = new Map((wxOverlay?.stations ?? []).map((s) => [s.station_code, s.flight_category ?? ""]));
  const { data: flightEvents } = useRecentFlightEvents(20);

  const allPositions = snapshot?.aircraft_positions ?? [];
  const positions = station ? allPositions.filter((p) => p.station === station) : allPositions;
  const events = snapshot?.timeline_events ?? [];
  const timelineEvents = station
    ? events.filter((e) => positions.some((p) => p.aircraft_id === e.aircraft_id))
    : events;
  const predEvents = snapshot?.predictive_events ?? [];
  const predictiveEvents = station
    ? predEvents.filter((e) => positions.some((p) => p.aircraft_id === e.aircraft_id))
    : predEvents;

  // When pinned, a new click leaves the current drawer content in place.
  function open(target: DrawerTarget) {
    setDrawer((cur) => (pinned && cur ? cur : target));
  }
  function closeDrawer() {
    setDrawer(null);
    setPinned(false);
  }

  return (
    <div className="flex h-full flex-col" data-testid="command-center-canvas">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-border px-6 py-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="eyebrow">Operations</p>
          <h1 className="font-serif text-2xl leading-tight text-foreground">Command Center</h1>
          <p className="text-sm text-subtext">Your operation, live.</p>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <div className="flex items-center gap-4">
            <LiveClock />
            <Select value={fleetId} onValueChange={setFleetId}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Fleets</SelectItem>
                {(fleets ?? []).map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex border border-border">
              {TIME_WINDOWS.map((w) => (
                <button
                  key={w.value}
                  type="button"
                  aria-pressed={win === w.value}
                  onClick={() => setWin(w.value)}
                  className={cn(
                    "border-r border-border px-2.5 py-1 text-xs transition-colors last:border-r-0",
                    win === w.value ? "bg-primary text-primary-foreground" : "text-subtext hover:text-foreground",
                  )}
                >
                  {w.label}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setCrewOn((v) => !v)} className={cn("border px-2.5 py-1 text-xs transition-colors", crewOn ? "border-primary bg-primary text-primary-foreground" : "border-border text-subtext hover:text-foreground")} title="Overlay crew compliance">Crew</button>
            <button type="button" onClick={() => setWxOn((v) => !v)} className={cn("border px-2.5 py-1 text-xs transition-colors", wxOn ? "border-primary bg-primary text-primary-foreground" : "border-border text-subtext hover:text-foreground")} title="Overlay weather">Wx</button>
            <button type="button" onClick={() => setEventsOn((v) => !v)} className={cn("inline-flex items-center gap-1 border px-2.5 py-1 text-xs transition-colors", eventsOn ? "border-primary bg-primary text-primary-foreground" : "border-border text-subtext hover:text-foreground")} title="Flight event stream"><Radio className="h-3 w-3" /> Events</button>
          </div>
        </div>
      </div>

      {/* Weather SIGMET banner */}
      {wxOn && (wxOverlay?.sigmets.length ?? 0) > 0 && (
        <div className="flex items-center gap-2 border-b border-severity-high/40 bg-severity-high/5 px-6 py-1.5">
          <span className="font-mono text-eyebrow uppercase tracking-wider text-severity-high">SIGMET</span>
          <span className="truncate font-mono text-[11px] text-body">{wxOverlay?.sigmets[0]?.raw_text}</span>
          {(wxOverlay?.sigmets.length ?? 0) > 1 && <span className="font-mono text-[10px] text-hint">+{(wxOverlay?.sigmets.length ?? 1) - 1} more</span>}
        </div>
      )}

      {/* Body: (optional) event stream + canvas column + (optional) drawer column */}
      <div className="flex min-h-0 flex-1">
        {eventsOn && (
          <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-surface/30">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="font-mono text-eyebrow uppercase tracking-wider text-label">Flight events</span>
              <button type="button" onClick={() => setEventsOn(false)} aria-label="Close"><X className="h-3.5 w-3.5 text-label hover:text-foreground" /></button>
            </div>
            <div className="flex-1 overflow-y-auto avir-scroll">
              {(flightEvents ?? []).map((e) => (
                <Link key={e.id} href={`/flight-ops/flights/${e.flight_id}`} className="block border-b border-border/50 px-3 py-1.5 hover:bg-surface/60">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] font-medium text-foreground">{flightEventLabel(e.event_type)}</span>
                    <span className="font-mono text-[9px] text-hint">{new Date(e.event_time_utc).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <div className="font-mono text-[10px] text-hint">{e.flight_number} · {e.origin_station}→{e.destination_station}</div>
                </Link>
              ))}
              {(!flightEvents || flightEvents.length === 0) && <p className="px-3 py-3 text-xs text-hint">No recent events.</p>}
            </div>
          </aside>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Band 1 — live fleet map */}
          <div className="relative min-h-[240px] border-b border-border" style={{ flex: "4 1 0%" }}>
            {isLoading ? (
              <div className="flex h-full items-center justify-center bg-[#0a0a0f] text-xs text-hint">
                Loading fleet…
              </div>
            ) : (
              <MapPanel
                positions={positions}
                onSelect={(p) => open({ kind: "aircraft", aircraftId: p.aircraft_id, tail: p.tail_number })}
              />
            )}
          </div>

          {/* Band 2 — station rollup strip */}
          <div className="h-[104px] shrink-0 border-b border-border">
            <StationStrip
              rollups={snapshot?.station_rollups ?? []}
              selected={station}
              crewByStation={crewOn ? crewByStation : undefined}
              wxByStation={wxOn ? wxByStation : undefined}
              onSelect={(s) => {
                setStation(s);
                if (s) open({ kind: "station", stationCode: s });
                else if (drawer?.kind === "station") closeDrawer();
              }}
            />
          </div>

          {/* Band 3 — operational timeline */}
          <div className="min-h-[240px]" style={{ flex: "5 1 0%" }}>
            <OpsTimeline
              positions={positions}
              events={timelineEvents}
              predictiveEvents={predictiveEvents}
              windowHours={hours}
              now={Date.now()}
              crewStatus={crewOn ? crewStatus : undefined}
              onEventClick={(e) => open({ kind: "event", event: e })}
              onPredictionClick={(p) => open({ kind: "prediction", prediction: p })}
            />
          </div>
        </div>

        <CanvasDrawer
          target={drawer}
          fleetId={fleetId === "all" ? null : fleetId}
          pinned={pinned}
          onTogglePin={() => setPinned((p) => !p)}
          onClose={closeDrawer}
          onSelectStation={(s) => {
            setStation(s);
            if (!s && drawer?.kind === "station") closeDrawer();
          }}
        />
      </div>
    </div>
  );
}
