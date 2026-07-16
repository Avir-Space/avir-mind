"use client";

import { ArrowUpRight, Plane, Radio, X } from "lucide-react";
import Link from "next/link";

import { canvasState, SEVERITY_HEX } from "@/lib/design/command-center";
import { useAircraftDrawer } from "@/lib/queries/use-aircraft-drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { CommandCenterSnapshot, DrawerTarget } from "@/types/command-center";

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border px-4 py-3">
      <p className="mb-2 font-mono text-eyebrow uppercase tracking-wider text-label">{label}</p>
      {children}
    </div>
  );
}

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function AircraftBody({ aircraftId }: { aircraftId: string }) {
  const { data, isLoading } = useAircraftDrawer(aircraftId);
  if (isLoading || !data) {
    return (
      <div className="space-y-2 p-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }
  const meta = canvasState(data.state);
  return (
    <>
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.hex }} />
            <span className="font-mono text-lg text-foreground">{data.tail_number}</span>
          </div>
          <p className="mt-0.5 font-mono text-[11px] text-hint">
            {data.aircraft_type} · {data.current_station ?? data.base_station ?? "—"}
          </p>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-wider" style={{ color: meta.hex }}>
          {meta.label}
        </span>
      </div>

      <Section label="Status">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="border border-border py-2">
            <p className="font-mono text-xl text-foreground">{data.active_signals_count}</p>
            <p className="font-mono text-[9px] uppercase text-label">Signals</p>
          </div>
          <div className="border border-border py-2">
            <p className="font-mono text-xl text-foreground">{data.active_tasks_count}</p>
            <p className="font-mono text-[9px] uppercase text-label">Tasks</p>
          </div>
          <div className="border border-border py-2">
            <p className={cn("font-mono text-xl", data.dispatch_blocking_count > 0 ? "text-severity-critical" : "text-foreground")}>
              {data.dispatch_blocking_count}
            </p>
            <p className="font-mono text-[9px] uppercase text-label">Blocking</p>
          </div>
        </div>
      </Section>

      {data.primary_task && (
        <Section label="Primary Task">
          <p className="text-sm text-foreground">{data.primary_task.title}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {data.primary_task.aog && (
              <span className="border border-severity-critical px-1.5 py-0.5 font-mono text-[9px] uppercase text-severity-critical">AOG</span>
            )}
            {data.primary_task.dispatch_blocking && (
              <span className="border border-severity-high px-1.5 py-0.5 font-mono text-[9px] uppercase text-severity-high">Blocking</span>
            )}
            <span className="border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase text-label">
              {data.primary_task.risk_band} risk
            </span>
          </div>
        </Section>
      )}

      {data.next_flight && (
        <Section label="Next Flight">
          <div className="flex items-center justify-between">
            <span className="font-mono text-sm text-foreground">
              {data.next_flight.origin} → {data.next_flight.destination}
            </span>
            <span className="font-mono text-[10px] uppercase text-label">{data.next_flight.status}</span>
          </div>
          <p className="mt-1 font-mono text-[11px] text-hint">
            Dep {fmt(data.next_flight.scheduled_departure_utc)} · Arr {fmt(data.next_flight.scheduled_arrival_utc)}
          </p>
        </Section>
      )}

      {data.top_signals.length > 0 && (
        <Section label="Active Signals">
          <ul className="space-y-1.5">
            {data.top_signals.map((s) => (
              <li key={s.signal_id}>
                <Link href={`/signals/${s.signal_id}`} className="flex items-start gap-2 hover:text-primary">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: SEVERITY_HEX[s.severity] ?? SEVERITY_HEX.info }} />
                  <span className="text-[13px] leading-snug text-body">{s.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="border-t border-border p-4">
        <Link
          href={`/aircraft/${data.aircraft_id}`}
          className="inline-flex items-center gap-1.5 border border-primary px-3 py-1.5 text-sm text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
        >
          <Plane className="h-3.5 w-3.5" /> Open Aircraft Profile
        </Link>
      </div>
    </>
  );
}

function StationBody({ code, snapshot }: { code: string; snapshot: CommandCenterSnapshot }) {
  const rollup = snapshot.station_rollups.find((r) => r.station_code === code);
  const here = snapshot.aircraft_positions.filter((p) => p.station === code);
  return (
    <>
      <div className="px-4 py-3">
        <span className="font-mono text-2xl text-foreground">{code}</span>
        <p className="mt-0.5 font-mono text-[11px] text-hint">
          {rollup?.aircraft_on_ground ?? 0} on ground · {rollup?.aircraft_inbound ?? 0} inbound
        </p>
      </div>
      <Section label="Load">
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="border border-border py-2">
            <p className="font-mono text-xl text-severity-high">{rollup?.active_signals_count ?? 0}</p>
            <p className="font-mono text-[9px] uppercase text-label">Active Signals</p>
          </div>
          <div className="border border-border py-2">
            <p className="font-mono text-xl text-severity-critical">{rollup?.dispatch_blocking_count ?? 0}</p>
            <p className="font-mono text-[9px] uppercase text-label">Blocking Dispatch</p>
          </div>
        </div>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-hint">Weather: — (Phase 3+)</p>
      </Section>
      <Section label="Aircraft Here">
        {here.length === 0 ? (
          <p className="text-xs text-hint">None on ground at this station.</p>
        ) : (
          <ul className="space-y-1">
            {here.map((p) => (
              <li key={p.aircraft_id} className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: canvasState(p.state).hex }} />
                <span className="font-mono text-[12px] text-body">{p.tail_number}</span>
                <span className="font-mono text-[10px] text-hint">{p.aircraft_type}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <div className="border-t border-border p-4">
        <span className="inline-flex cursor-not-allowed items-center gap-1.5 border border-border px-3 py-1.5 text-sm text-hint">
          <ArrowUpRight className="h-3.5 w-3.5" /> Open station view (Phase 3+)
        </span>
      </div>
    </>
  );
}

function EventBody({ event }: { event: Extract<DrawerTarget, { kind: "event" }>["event"] }) {
  const d = event.event_detail_json;
  if (d.kind === "signal") {
    return (
      <>
        <div className="flex items-center gap-2 px-4 py-3">
          <Radio className="h-4 w-4" style={{ color: SEVERITY_HEX[d.severity ?? "info"] }} />
          <span className="font-mono text-[11px] uppercase tracking-wider" style={{ color: SEVERITY_HEX[d.severity ?? "info"] }}>
            {d.severity} signal
          </span>
        </div>
        <Section label={`${event.tail_number} · ${new Date(event.event_time_utc).toLocaleString()}`}>
          <p className="text-sm text-foreground">{d.title}</p>
        </Section>
        {d.signal_id && (
          <div className="border-t border-border p-4">
            <Link
              href={`/signals/${d.signal_id}`}
              className="inline-flex items-center gap-1.5 border border-primary px-3 py-1.5 text-sm text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
            >
              <ArrowUpRight className="h-3.5 w-3.5" /> Open Signal
            </Link>
          </div>
        )}
      </>
    );
  }
  return (
    <>
      <div className="flex items-center gap-2 px-4 py-3">
        <Plane className={cn("h-4 w-4 text-primary", d.kind === "arrival" && "rotate-90")} />
        <span className="font-mono text-[11px] uppercase tracking-wider text-primary">{d.kind}</span>
      </div>
      <Section label={`${event.tail_number} · ${d.flight_number ?? "Flight"}`}>
        <div className="flex items-center justify-between">
          <span className="font-mono text-lg text-foreground">
            {d.origin} → {d.destination}
          </span>
          <span className="font-mono text-[10px] uppercase text-label">{d.status}</span>
        </div>
        <p className="mt-1 font-mono text-[11px] text-hint">
          {d.kind === "departure" ? "Departs" : "Arrives"} {new Date(event.event_time_utc).toLocaleString()}
        </p>
      </Section>
    </>
  );
}

export function CanvasDrawer({
  target,
  snapshot,
  onClose,
}: {
  target: DrawerTarget;
  snapshot: CommandCenterSnapshot | undefined;
  onClose: () => void;
}) {
  if (!target) return null;
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} aria-hidden />
      <aside className="fixed right-0 top-14 bottom-0 z-50 w-[380px] max-w-[90vw] overflow-y-auto avir-scroll border-l border-border bg-page shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <span className="font-mono text-eyebrow uppercase tracking-wider text-label">
            {target.kind === "aircraft" ? "Aircraft" : target.kind === "station" ? "Station" : "Event"}
          </span>
          <button type="button" onClick={onClose} aria-label="Close" className="text-label hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        {target.kind === "aircraft" && <AircraftBody aircraftId={target.aircraftId} />}
        {target.kind === "station" && snapshot && <StationBody code={target.stationCode} snapshot={snapshot} />}
        {target.kind === "event" && <EventBody event={target.event} />}
      </aside>
    </>
  );
}
