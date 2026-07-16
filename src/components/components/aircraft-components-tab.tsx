"use client";

import { Cpu, TrendingUp } from "lucide-react";
import Link from "next/link";

import { HealthBar, HealthDot } from "@/components/components/health-bar";
import { EmptyState } from "@/components/avir/empty-state";
import { MonoText } from "@/components/avir/mono-text";
import { Skeleton } from "@/components/ui/skeleton";
import { componentType, healthBand } from "@/lib/design/components";
import { useAircraftComponents } from "@/lib/queries/use-aircraft-components";

/** Aircraft Profile → Components tab: components installed on this tail. */
export function AircraftComponentsTab({ aircraftId }: { aircraftId: string }) {
  const { data, isLoading } = useAircraftComponents(aircraftId);

  if (isLoading) {
    return (
      <div className="space-y-2 p-6">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
      </div>
    );
  }
  if (!data || data.length === 0) {
    return (
      <div className="p-6">
        <EmptyState icon={Cpu} headline="No components on this aircraft">
          <p>Serialized components installed on this tail will appear here.</p>
        </EmptyState>
      </div>
    );
  }

  const scored = data.filter((c) => c.health_score != null);
  const avg = scored.length ? Math.round(scored.reduce((s, c) => s + (c.health_score ?? 0), 0) / scored.length) : null;
  const band = healthBand(avg);
  const predTotal = data.reduce((s, c) => s + (c.active_predictions ?? 0), 0);

  return (
    <div className="p-6">
      {/* Aggregate health */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4 border border-border bg-card p-4">
        <div>
          <p className="font-mono text-eyebrow uppercase text-label">Aircraft component health</p>
          <div className="mt-1.5 flex items-center gap-3">
            <span className="font-mono text-3xl leading-none" style={{ color: band.hex }}>{avg ?? "—"}</span>
            <span className="font-mono text-[11px] uppercase tracking-wider" style={{ color: band.hex }}>{band.label}</span>
            <span className="font-mono text-[11px] text-hint">{data.length} components</span>
          </div>
        </div>
        {predTotal > 0 && (
          <span className="inline-flex items-center gap-1.5 border border-primary/40 bg-primary/5 px-2.5 py-1 font-mono text-xs text-primary">
            <TrendingUp className="h-3.5 w-3.5" /> {predTotal} active prediction{predTotal === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div className="space-y-2">
        {data.map((c) => {
          const meta = componentType(c.component_type);
          const Icon = meta.icon;
          return (
            <Link
              key={c.id}
              href={`/components/${c.id}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 border border-border bg-card px-4 py-3 transition-colors hover:border-border-strong"
            >
              <span className="inline-flex items-center gap-2">
                <HealthDot score={c.health_score} />
                <Icon className="h-4 w-4 text-label" strokeWidth={1.75} />
                <span className="text-sm font-medium text-foreground">{meta.label}</span>
                {c.position_code && <span className="font-mono text-[10px] uppercase text-hint">{c.position_code}</span>}
              </span>
              <MonoText muted className="text-[12px]">{c.serial_number}</MonoText>
              <MonoText muted className="text-[11px]">
                {(c.current_cycles ?? 0).toLocaleString()}c · {Math.round(c.current_flight_hours ?? 0).toLocaleString()}h
              </MonoText>
              <div className="ml-auto flex items-center gap-4">
                {c.next_scheduled_event_type && (
                  <span className="font-mono text-[11px] text-subtext">{c.next_scheduled_event_type}</span>
                )}
                {c.active_predictions > 0 && (
                  <span className="inline-flex items-center gap-1 font-mono text-[11px] text-primary">
                    <TrendingUp className="h-3 w-3" /> {c.active_predictions}
                  </span>
                )}
                <HealthBar score={c.health_score} />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
