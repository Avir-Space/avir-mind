"use client";

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
import { useCommandCenterSnapshot } from "@/lib/queries/use-command-center-snapshot";
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

  const hours = TIME_WINDOWS.find((w) => w.value === win)?.hours ?? 12;
  const { data: snapshot, isLoading } = useCommandCenterSnapshot(
    fleetId === "all" ? null : fleetId,
    hours,
  );

  const allPositions = snapshot?.aircraft_positions ?? [];
  const positions = station ? allPositions.filter((p) => p.station === station) : allPositions;
  const events = snapshot?.timeline_events ?? [];
  const timelineEvents = station
    ? events.filter((e) => positions.some((p) => p.aircraft_id === e.aircraft_id))
    : events;

  // When pinned, a new click leaves the current drawer content in place.
  function open(target: DrawerTarget) {
    setDrawer((cur) => (pinned && cur ? cur : target));
  }
  function closeDrawer() {
    setDrawer(null);
    setPinned(false);
  }

  return (
    <div className="flex h-full flex-col">
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
          <div className="inline-flex border border-border">
            {TIME_WINDOWS.map((w) => (
              <button
                key={w.value}
                type="button"
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
        </div>
      </div>

      {/* Body: canvas column + (optional) drawer column */}
      <div className="flex min-h-0 flex-1">
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
              windowHours={hours}
              now={Date.now()}
              onEventClick={(e) => open({ kind: "event", event: e })}
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
