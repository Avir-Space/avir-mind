"use client";

import { Package, TrendingUp } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/avir/empty-state";
import { MonoText } from "@/components/avir/mono-text";
import { Skeleton } from "@/components/ui/skeleton";
import { criticality } from "@/lib/design/inventory";
import { useAircraftParts } from "@/lib/queries/use-inventory";
import { cn } from "@/lib/utils";

/** Aircraft Profile → Parts tab: compatible parts + coverage at the tail's base. */
export function AircraftPartsTab({ aircraftId }: { aircraftId: string }) {
  const { data, isLoading } = useAircraftParts(aircraftId);

  if (isLoading) {
    return <div className="space-y-2 p-6">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  }
  if (!data || data.parts.length === 0) {
    return <div className="p-6"><EmptyState icon={Package} headline="No compatible parts catalogued"><p>Parts compatible with this aircraft type will appear here.</p></EmptyState></div>;
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center gap-4 border border-border bg-card p-4">
        <div><p className="font-mono text-eyebrow uppercase text-label">Type</p><p className="mt-0.5 text-sm text-foreground">{data.aircraft_type}</p></div>
        <div><p className="font-mono text-eyebrow uppercase text-label">Home base</p><p className="mt-0.5 font-mono text-sm text-foreground">{data.base_station ?? "—"}</p></div>
        <div><p className="font-mono text-eyebrow uppercase text-label">Compatible parts</p><p className="mt-0.5 text-sm text-foreground">{data.parts.length}</p></div>
        {data.predicted_demand > 0 && (
          <span className="ml-auto inline-flex items-center gap-1.5 border border-primary/40 bg-primary/5 px-2.5 py-1 font-mono text-xs text-primary"><TrendingUp className="h-3.5 w-3.5" /> {data.predicted_demand} active prediction{data.predicted_demand === 1 ? "" : "s"}</span>
        )}
      </div>

      <div className="overflow-x-auto avir-scroll border border-border">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-left">{["Part #", "Description", "Criticality", "Total Stock", `At ${data.base_station ?? "base"}`, "Lead"].map((h) => <th key={h} className="px-3 py-2 font-mono text-eyebrow uppercase text-label">{h}</th>)}</tr></thead>
          <tbody>
            {data.parts.map((p) => {
              const cr = criticality(p.criticality);
              const noBase = p.available_at_base === 0;
              return (
                <tr key={p.id} className="border-b border-border/60">
                  <td className="px-3 py-2"><Link href={`/inventory/parts/${p.id}`} className="font-mono text-[12px] text-primary hover:underline">{p.part_number}</Link></td>
                  <td className="max-w-[260px] truncate px-3 py-2 text-subtext">{p.description}</td>
                  <td className="px-3 py-2"><span className="font-mono text-[11px] uppercase" style={{ color: cr.hex }}>{cr.label}</span></td>
                  <td className="px-3 py-2 font-mono">{p.total_available}</td>
                  <td className={cn("px-3 py-2 font-mono", noBase ? "text-severity-high" : "text-severity-low")}>{p.available_at_base}{noBase && " ⚠"}</td>
                  <td className="px-3 py-2 font-mono text-hint">{p.typical_lead_time_days ?? "—"}d</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
