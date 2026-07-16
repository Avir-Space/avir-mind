"use client";

import { ArrowUpRight, Filter, Pin, Plane, Radio, TrendingUp, X } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { canvasState, SEVERITY_HEX, STATION_NAMES } from "@/lib/design/command-center";
import { horizonLabel } from "@/lib/design/components";
import type { PredictiveEvent } from "@/types/components";
import { useAircraftDrawer } from "@/lib/queries/use-aircraft-drawer";
import { useStationDrawer } from "@/lib/queries/use-station-drawer";
import { useAuth } from "@/lib/providers/auth-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { DrawerTarget } from "@/types/command-center";

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border px-4 py-3">
      <p className="mb-2 font-mono text-eyebrow uppercase tracking-wider text-label">{label}</p>
      {children}
    </div>
  );
}

function dt(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function hoursSince(iso: string | null | undefined) {
  if (!iso) return null;
  const h = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (h < 0) return null;
  return h < 1 ? `${Math.round(h * 60)}m` : `${Math.round(h)}h`;
}

function SigRow({ id, severity, title, tail }: { id: string; severity: string; title: string; tail?: string }) {
  return (
    <Link href={`/signals/${id}`} className="flex items-start gap-2 py-0.5 hover:text-primary">
      <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: SEVERITY_HEX[severity] ?? SEVERITY_HEX.info }} />
      <span className="text-[13px] leading-snug text-body">
        {title}
        {tail ? <span className="ml-1 font-mono text-[10px] text-hint">{tail}</span> : null}
      </span>
    </Link>
  );
}

function AircraftBody({ aircraftId }: { aircraftId: string }) {
  const { data, isLoading } = useAircraftDrawer(aircraftId);
  const { user } = useAuth();
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
  const since = hoursSince(data.last_transition_at);
  const assignee = data.primary_task
    ? data.primary_task.assignee_user_id
      ? data.primary_task.assignee_user_id === user?.id
        ? "You"
        : "Assigned"
      : "Unassigned"
    : null;
  return (
    <>
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.hex }} />
            <span className="font-mono text-xl text-foreground">{data.tail_number}</span>
            <span className="font-mono text-[11px] text-hint">{data.aircraft_type}</span>
          </div>
          <p className="mt-1 font-mono text-[11px] text-hint">
            Base {data.base_station ?? "—"}
            {since ? ` · last event ${since} ago` : ""}
          </p>
        </div>
        <span className="border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider" style={{ borderColor: meta.hex, color: meta.hex }}>
          {meta.label}
        </span>
      </div>

      <Section label={`Active signals · ${data.active_signals_count}`}>
        {data.top_signals.length === 0 ? (
          <p className="text-xs text-hint">No active signals.</p>
        ) : (
          <div className="space-y-0.5">
            {data.top_signals.slice(0, 3).map((s) => (
              <SigRow key={s.signal_id} id={s.signal_id} severity={s.severity} title={s.title} />
            ))}
          </div>
        )}
      </Section>

      <Section label="Current task">
        {data.primary_task ? (
          <>
            <p className="text-sm text-foreground">{data.primary_task.title}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase text-label">{data.primary_task.status}</span>
              <span className={cn("border px-1.5 py-0.5 font-mono text-[9px] uppercase", assignee === "Unassigned" ? "border-border text-hint" : "border-border text-body")}>
                {assignee}
              </span>
              {data.primary_task.aog && (
                <span className="border border-severity-critical px-1.5 py-0.5 font-mono text-[9px] uppercase text-severity-critical">AOG</span>
              )}
              {data.primary_task.dispatch_blocking && (
                <span className="border border-severity-high px-1.5 py-0.5 font-mono text-[9px] uppercase text-severity-high">Blocking</span>
              )}
            </div>
          </>
        ) : (
          <p className="text-xs text-hint">No active tasks.</p>
        )}
      </Section>

      <Section label="Next scheduled">
        {data.next_flights.length === 0 ? (
          <p className="text-xs text-hint">No upcoming flights.</p>
        ) : (
          <ul className="space-y-1.5">
            {data.next_flights.slice(0, 2).map((f, i) => (
              <li key={i} className="flex items-center justify-between">
                <span className="font-mono text-[13px] text-foreground">
                  {f.origin} → {f.destination}
                  <span className="ml-2 text-[10px] text-hint">{f.flight_number}</span>
                </span>
                <span className="font-mono text-[10px] text-hint">{dt(f.scheduled_departure_utc)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

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

function StationBody({
  code,
  fleetId,
  filtered,
  onToggleFilter,
}: {
  code: string;
  fleetId: string | null;
  filtered: boolean;
  onToggleFilter: (next: boolean) => void;
}) {
  const { data, isLoading } = useStationDrawer(code, fleetId);
  return (
    <>
      <div className="px-4 py-3">
        <span className="font-mono text-2xl text-foreground">{code}</span>
        {STATION_NAMES[code] && <span className="ml-2 text-sm text-subtext">{STATION_NAMES[code]}</span>}
        <p className="mt-1 font-mono text-[11px] text-hint">
          {(data?.aircraft_on_ground ?? 0)} on ground · {(data?.aircraft_inbound ?? 0)} inbound ·{" "}
          {(data?.aircraft_outbound_6h ?? 0)} outbound (6h)
        </p>
      </div>

      {isLoading || !data ? (
        <div className="space-y-2 p-4">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <>
          <Section label={`Aircraft here now · ${data.aircraft_here.length}`}>
            {data.aircraft_here.length === 0 ? (
              <p className="text-xs text-hint">None on ground at this station.</p>
            ) : (
              <ul className="space-y-1">
                {data.aircraft_here.map((p) => (
                  <li key={p.aircraft_id} className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: canvasState(p.state).hex }} />
                    <Link href={`/aircraft/${p.aircraft_id}`} className="font-mono text-[12px] text-body hover:text-primary">
                      {p.tail_number}
                    </Link>
                    <span className="font-mono text-[10px] text-hint">{p.aircraft_type}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section label={`Active signals at ${code} · ${data.active_signals_count}`}>
            {data.top_signals.length === 0 ? (
              <p className="text-xs text-hint">No active signals here.</p>
            ) : (
              <div className="space-y-0.5">
                {data.top_signals.map((s) => (
                  <SigRow key={s.signal_id} id={s.signal_id} severity={s.severity} title={s.title} tail={s.tail_number} />
                ))}
              </div>
            )}
          </Section>
        </>
      )}

      <Section label="Weather">
        <p className="text-xs text-hint">— (integration in a later phase)</p>
      </Section>

      <div className="border-t border-border p-4">
        <button
          type="button"
          onClick={() => onToggleFilter(!filtered)}
          className={cn(
            "inline-flex items-center gap-1.5 border px-3 py-1.5 text-sm transition-colors",
            filtered ? "border-primary bg-primary text-primary-foreground" : "border-primary text-primary hover:bg-primary hover:text-primary-foreground",
          )}
        >
          <Filter className="h-3.5 w-3.5" /> {filtered ? "Filtering to this station" : "Filter Command Center to this station"}
        </button>
      </div>
    </>
  );
}

function EventBody({ event }: { event: Extract<DrawerTarget, { kind: "event" }>["event"] }) {
  const d = event.event_detail_json;
  const { data: ac } = useAircraftDrawer(event.aircraft_id);
  const when = new Date(event.event_time_utc);
  const delay = d.delay_minutes ?? 0;
  const predicted = new Date(when.getTime() + delay * 60_000);

  if (d.kind === "signal") {
    return (
      <>
        <div className="flex items-center gap-2 px-4 py-3">
          <Radio className="h-4 w-4" style={{ color: SEVERITY_HEX[d.severity ?? "info"] }} />
          <div>
            <span className="font-mono text-[11px] uppercase tracking-wider" style={{ color: SEVERITY_HEX[d.severity ?? "info"] }}>
              {d.severity} signal
            </span>
            <p className="font-mono text-[11px] text-hint">{event.tail_number}</p>
          </div>
        </div>
        <Section label={`Timing · ${when.toLocaleString()}`}>
          <p className="text-sm text-foreground">{d.title}</p>
        </Section>
        {ac && (
          <Section label="Aircraft state">
            <p className="font-mono text-[12px] text-body">
              {canvasState(ac.state).label}
              {ac.next_event_type ? ` → ${ac.next_event_type}` : ""}
            </p>
          </Section>
        )}
        {d.signal_id && (
          <div className="border-t border-border p-4">
            <Link href={`/signals/${d.signal_id}`} className="inline-flex items-center gap-1.5 border border-primary px-3 py-1.5 text-sm text-primary transition-colors hover:bg-primary hover:text-primary-foreground">
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
        <div>
          <span className="font-mono text-sm text-foreground">{d.flight_number ?? d.kind}</span>
          <p className="font-mono text-[11px] text-hint">
            {event.tail_number} · {d.origin} → {d.destination}
          </p>
        </div>
      </div>
      <Section label="Timing">
        <div className="space-y-1 font-mono text-[12px]">
          <div className="flex justify-between">
            <span className="text-label">Scheduled</span>
            <span className="text-foreground">{when.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-label">Predicted</span>
            <span className={cn(delay > 0 ? "text-severity-high" : "text-foreground")}>{predicted.toLocaleString()}</span>
          </div>
          {delay > 0 && (
            <div className="flex justify-between">
              <span className="text-label">Delay</span>
              <span className="text-severity-high">+{delay}m</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-label">Status</span>
            <span className="uppercase text-body">{d.status}</span>
          </div>
        </div>
      </Section>
      <Section label="Related signals">
        {ac && ac.top_signals.length > 0 ? (
          <div className="space-y-0.5">
            {ac.top_signals.slice(0, 3).map((s) => (
              <SigRow key={s.signal_id} id={s.signal_id} severity={s.severity} title={s.title} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-hint">No signals anchored to this aircraft.</p>
        )}
      </Section>
      {ac && (
        <Section label="Aircraft state">
          <p className="font-mono text-[12px] text-body">
            {canvasState(ac.state).label}
            {ac.next_event_type ? ` → ${ac.next_event_type}` : ""}
          </p>
        </Section>
      )}
      <div className="border-t border-border p-4">
        <span className="inline-flex cursor-not-allowed items-center gap-1.5 border border-border px-3 py-1.5 text-sm text-hint">
          <ArrowUpRight className="h-3.5 w-3.5" /> Open flight detail (Phase 3+)
        </span>
      </div>
    </>
  );
}

function PredictionBody({ prediction }: { prediction: PredictiveEvent }) {
  const hex = SEVERITY_HEX[prediction.severity] ?? SEVERITY_HEX.info;
  const horizon = horizonLabel(prediction.prediction_horizon);
  return (
    <>
      <div className="flex items-center gap-2 px-4 py-3">
        <TrendingUp className="h-4 w-4" style={{ color: hex }} />
        <div>
          <span className="font-mono text-[11px] uppercase tracking-wider" style={{ color: hex }}>
            Predicted · {prediction.severity}
          </span>
          <p className="font-mono text-[11px] text-hint">
            {prediction.tail_number}
            {prediction.predicted_event_type ? ` · ${prediction.predicted_event_type}` : ""}
          </p>
        </div>
      </div>
      <Section label="Prediction">
        <p className="text-sm text-foreground">{prediction.title}</p>
      </Section>
      {horizon && (
        <Section label="Horizon">
          <span className="inline-flex items-center gap-2 border border-primary/30 bg-primary/5 px-2 py-1 font-mono text-[12px] text-foreground">
            {horizon}
          </span>
        </Section>
      )}
      <div className="flex flex-wrap gap-2 border-t border-border p-4">
        <Link href={`/signals/${prediction.signal_id}`} className="inline-flex items-center gap-1.5 border border-primary px-3 py-1.5 text-sm text-primary transition-colors hover:bg-primary hover:text-primary-foreground">
          <ArrowUpRight className="h-3.5 w-3.5" /> Open Prediction
        </Link>
        {prediction.component_id && (
          <Link href={`/components/${prediction.component_id}`} className="inline-flex items-center gap-1.5 border border-border px-3 py-1.5 text-sm text-body transition-colors hover:border-border-strong">
            Component
          </Link>
        )}
      </div>
    </>
  );
}

export function CanvasDrawer({
  target,
  fleetId,
  pinned,
  onTogglePin,
  onClose,
  onSelectStation,
}: {
  target: DrawerTarget;
  fleetId: string | null;
  pinned: boolean;
  onTogglePin: () => void;
  onClose: () => void;
  onSelectStation: (station: string | null) => void;
}) {
  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, onClose]);

  if (!target) return null;
  const heading =
    target.kind === "aircraft" ? "Aircraft"
    : target.kind === "station" ? "Station"
    : target.kind === "prediction" ? "Prediction"
    : "Event";

  return (
    <>
      {/* mobile backdrop only */}
      <div className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={onClose} aria-hidden />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full flex-col overflow-hidden border-l border-border bg-page shadow-2xl md:static md:z-auto md:w-[420px] md:shrink-0 md:shadow-none">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
          <span className="font-mono text-eyebrow uppercase tracking-wider text-label">{heading}</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onTogglePin}
              aria-label={pinned ? "Unpin drawer" : "Pin drawer"}
              aria-pressed={pinned}
              className={cn("flex h-6 w-6 items-center justify-center transition-colors", pinned ? "text-primary" : "text-label hover:text-foreground")}
            >
              <Pin className={cn("h-3.5 w-3.5", pinned && "fill-current")} />
            </button>
            <button type="button" onClick={onClose} aria-label="Close drawer" className="flex h-6 w-6 items-center justify-center text-label hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto avir-scroll">
          {target.kind === "aircraft" && <AircraftBody aircraftId={target.aircraftId} />}
          {target.kind === "station" && (
            <StationBody
              code={target.stationCode}
              fleetId={fleetId}
              filtered
              onToggleFilter={(next) => onSelectStation(next ? target.stationCode : null)}
            />
          )}
          {target.kind === "event" && <EventBody event={target.event} />}
          {target.kind === "prediction" && <PredictionBody prediction={target.prediction} />}
        </div>
      </aside>
    </>
  );
}
