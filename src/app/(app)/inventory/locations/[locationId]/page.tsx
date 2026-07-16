"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { MonoText } from "@/components/avir/mono-text";
import { Skeleton } from "@/components/ui/skeleton";
import { assetStatus, assetType, criticality, locationType, movementType } from "@/lib/design/inventory";
import { useLocationDetail } from "@/lib/queries/use-inventory";
import { cn } from "@/lib/utils";

const money = (n: number | null | undefined) => "$" + Math.round(Number(n ?? 0)).toLocaleString();

export default function LocationDetailPage() {
  const params = useParams<{ locationId: string }>();
  const { data, isLoading } = useLocationDetail(params.locationId);

  if (isLoading || !data?.location) {
    return <div className="p-6"><Skeleton className="h-10 w-64" /><Skeleton className="mt-4 h-64 w-full" /></div>;
  }
  const l = data.location;
  const lt = locationType(l.location_type);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-6 pb-4 pt-4">
        <Link href="/inventory" className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-label hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /> Inventory</Link>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="font-mono text-2xl text-foreground">{l.location_code}</h1>
          <span className="text-sm text-subtext">{l.location_name}</span>
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase text-label"><lt.icon className="h-3.5 w-3.5" /> {lt.label}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 font-mono text-[11px] text-hint">
          {l.station_code && <span>Station {l.station_code}</span>}
          <span>{data.holdings.length} SKUs</span>
          <span>{money(data.total_value)} value</span>
          {l.climate_controlled && <span>climate-controlled</span>}
          {l.hazmat_certified && <span>hazmat-certified</span>}
        </div>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto avir-scroll p-6">
        <section>
          <p className="eyebrow mb-2">Stock holdings</p>
          <div className="overflow-x-auto avir-scroll border border-border">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left">{["Part #", "Description", "Available", "Reserved", "Reorder", "Value"].map((h) => <th key={h} className="px-3 py-2 font-mono text-eyebrow uppercase text-label">{h}</th>)}</tr></thead>
              <tbody>
                {data.holdings.map((h) => (
                  <tr key={h.part_id} className="border-b border-border/60">
                    <td className="px-3 py-2"><Link href={`/inventory/parts/${h.part_id}`} className="font-mono text-[12px] text-primary hover:underline">{h.part_number}</Link></td>
                    <td className="max-w-[240px] truncate px-3 py-2 text-subtext">{h.description}</td>
                    <td className={cn("px-3 py-2 font-mono", h.below_reorder && "text-severity-high")}>{h.quantity_available}</td>
                    <td className="px-3 py-2 font-mono text-subtext">{h.quantity_reserved}</td>
                    <td className="px-3 py-2 font-mono text-hint">{h.reorder_point ?? "—"}</td>
                    <td className="px-3 py-2 font-mono">{money(h.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <p className="eyebrow mb-2">Assets assigned ({data.assets.length})</p>
          {data.assets.length === 0 ? <p className="text-sm text-hint">No assets at this location.</p> : (
            <div className="flex flex-wrap gap-2">
              {data.assets.map((a) => {
                const at = assetType(a.asset_type);
                return (
                  <Link key={a.id} href={`/assets/${a.id}`} className="inline-flex items-center gap-2 border border-border bg-card px-3 py-2 hover:border-border-strong">
                    <at.icon className="h-3.5 w-3.5 text-label" />
                    <MonoText className="text-[12px] text-primary">{a.asset_tag}</MonoText>
                    <span className="text-[12px] text-subtext">{a.asset_name}</span>
                    <span className="h-2 w-2 rounded-full" style={{ background: assetStatus(a.current_status).hex }} />
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <p className="eyebrow mb-2">Recent movements</p>
          <div className="border border-border">
            {data.movements.map((m) => {
              const mt = movementType(m.movement_type);
              return (
                <div key={m.id} className="flex items-center gap-3 border-b border-border/60 px-3 py-2 last:border-b-0">
                  <span className="w-24 font-mono text-[11px] text-hint">{new Date(m.movement_date_utc).toLocaleDateString()}</span>
                  <span className="w-28 font-mono text-[11px] uppercase text-subtext">{mt.label}</span>
                  <span className={cn("font-mono text-[13px]", mt.dir === 1 ? "text-severity-low" : mt.dir === -1 ? "text-severity-high" : "text-foreground")}>{mt.dir === 1 ? "+" : mt.dir === -1 ? "−" : ""}{m.quantity}</span>
                </div>
              );
            })}
            {data.movements.length === 0 && <p className="px-3 py-3 text-sm text-hint">No movements.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
