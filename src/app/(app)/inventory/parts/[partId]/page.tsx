"use client";

import { ChevronLeft, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { MonoText } from "@/components/avir/mono-text";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { criticality, movementType, partCategory } from "@/lib/design/inventory";
import { usePartDetail } from "@/lib/queries/use-inventory";
import { useInventoryActions } from "@/lib/mutations/use-inventory-actions";
import { cn } from "@/lib/utils";

const money = (n: number | null | undefined) => "$" + Math.round(Number(n ?? 0)).toLocaleString();

export default function PartDetailPage() {
  const params = useParams<{ partId: string }>();
  const { data, isLoading } = usePartDetail(params.partId);
  const { reserveStock, consumeStock, recordMovement } = useInventoryActions();
  const { toast } = useToast();

  if (isLoading || !data?.part) {
    if (!isLoading && !data?.part) {
      return <div className="flex min-h-[50vh] flex-col items-center justify-center text-center"><h1 className="font-serif text-2xl text-foreground">Part not found</h1><Link href="/inventory" className="mt-4 text-sm text-primary hover:underline">Back to Inventory</Link></div>;
    }
    return <div className="p-6"><Skeleton className="h-10 w-64" /><Skeleton className="mt-4 h-64 w-full" /></div>;
  }

  const p = data.part;
  const cr = criticality(p.criticality);
  const totalStock = data.holdings.reduce((s, h) => s + h.quantity_available, 0);
  const maxMonthly = Math.max(1, ...data.demand.monthly.map((m) => Number(m.consumed)));

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-6 pb-4 pt-4">
        <Link href="/inventory" className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-label hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /> Inventory</Link>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="font-mono text-2xl text-foreground">{p.part_number}</h1>
          <span className="border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider" style={{ borderColor: cr.hex, color: cr.hex }}>{cr.label}</span>
          <span className="text-sm text-subtext">{p.manufacturer}</span>
        </div>
        <p className="mt-1 text-sm text-body">{p.description}</p>
        <div className="mt-2 flex flex-wrap gap-x-4 font-mono text-[11px] text-hint">
          <span>{partCategory(p.category).label}</span>
          {p.ata_chapter && <span>ATA {p.ata_chapter}</span>}
          <span>{money(p.current_price_usd)} ref</span>
          <span>lead {p.typical_lead_time_days ?? "—"}d</span>
          {p.alternative_part_numbers?.length ? <span>alt: {p.alternative_part_numbers.join(", ")}</span> : null}
        </div>
      </div>

      <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-border px-6">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="stock">Stock</TabsTrigger>
            <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
            <TabsTrigger value="movements">Movements</TabsTrigger>
            <TabsTrigger value="demand">Demand</TabsTrigger>
            <TabsTrigger value="aircraft">Compatible Aircraft</TabsTrigger>
          </TabsList>
        </div>
        <div className="flex-1 overflow-y-auto avir-scroll p-6">
          <TabsContent value="overview">
            <div className="grid max-w-3xl grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
              {[
                ["Total stock", `${totalStock} ${p.unit_of_measure}`],
                ["Locations", String(data.holdings.length)],
                ["Category", partCategory(p.category).label],
                ["ATA chapter", p.ata_chapter ?? "—"],
                ["Shelf life", p.shelf_life_days ? `${p.shelf_life_days} days` : "—"],
                ["Storage", p.storage_conditions ?? "—"],
                ["Hazmat", p.hazmat_class ?? "—"],
                ["Compatible types", (p.compatible_component_types ?? []).join(", ") || "—"],
                ["Compatible aircraft", (p.compatible_aircraft_types ?? []).join(", ") || "—"],
              ].map(([l, v]) => (
                <div key={l}><p className="font-mono text-eyebrow uppercase text-label">{l}</p><p className="mt-0.5 text-sm text-foreground">{v}</p></div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="stock">
            <div className="max-w-3xl overflow-x-auto avir-scroll border border-border">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border text-left">{["Location", "Available", "Reserved", "In Transit", "Reorder", "Actions"].map((h) => <th key={h} className="px-3 py-2 font-mono text-eyebrow uppercase text-label">{h}</th>)}</tr></thead>
                <tbody>
                  {data.holdings.map((h) => (
                    <tr key={h.location_id} className="border-b border-border/60">
                      <td className="px-3 py-2"><Link href={`/inventory/locations/${h.location_id}`} className="font-mono text-[12px] text-primary hover:underline">{h.location_code}</Link></td>
                      <td className={cn("px-3 py-2 font-mono", h.below_reorder && "text-severity-high")}>{h.quantity_available}</td>
                      <td className="px-3 py-2 font-mono text-subtext">{h.quantity_reserved}</td>
                      <td className="px-3 py-2 font-mono text-subtext">{h.quantity_in_transit}</td>
                      <td className="px-3 py-2 font-mono text-hint">{h.reorder_point ?? "—"}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1.5">
                          <button type="button" onClick={() => reserveStock.mutate({ partId: params.partId, locationId: h.location_id, quantity: 1 }, { onSuccess: () => toast({ title: "Reserved 1 unit" }) })} className="border border-border px-1.5 py-0.5 text-[10px] text-subtext hover:border-primary hover:text-primary">Reserve</button>
                          <button type="button" onClick={() => consumeStock.mutate({ partId: params.partId, locationId: h.location_id, quantity: 1 }, { onSuccess: () => toast({ title: "Consumed 1 unit" }) })} className="border border-border px-1.5 py-0.5 text-[10px] text-subtext hover:border-primary hover:text-primary">Consume</button>
                          <button type="button" onClick={() => recordMovement.mutate({ partId: params.partId, type: "receipt", quantity: 5, to: h.location_id }, { onSuccess: () => toast({ title: "Received 5 units" }) })} className="border border-border px-1.5 py-0.5 text-[10px] text-subtext hover:border-primary hover:text-primary">Receive</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="suppliers">
            {data.suppliers.length === 0 ? <p className="text-sm text-hint">No suppliers linked to this part.</p> : (
              <div className="max-w-3xl space-y-2">
                {data.suppliers.map((s) => (
                  <div key={s.supplier_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border border-border bg-card px-3 py-2">
                    <Link href={`/inventory/suppliers/${s.supplier_id}`} className="text-sm font-medium text-primary hover:underline">{s.supplier_name}</Link>
                    {s.is_preferred && <span className="border border-severity-low px-1.5 py-0.5 font-mono text-[9px] uppercase text-severity-low">Preferred</span>}
                    <span className="font-mono text-[11px] text-hint">{s.supplier_part_reference}</span>
                    <span className="ml-auto font-mono text-[12px] text-foreground">{money(s.typical_unit_price_usd)}</span>
                    <span className="font-mono text-[11px] text-hint">lead {s.typical_lead_time_days ?? "—"}d · MOQ {s.minimum_order_quantity ?? 1}</span>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="movements">
            {data.movements.length === 0 ? <p className="text-sm text-hint">No movements.</p> : (
              <div className="max-w-3xl border border-border">
                {data.movements.map((m) => {
                  const mt = movementType(m.movement_type);
                  return (
                    <div key={m.id} className="flex items-center gap-3 border-b border-border/60 px-3 py-2 last:border-b-0">
                      <span className="w-24 font-mono text-[11px] text-hint">{new Date(m.movement_date_utc).toLocaleDateString()}</span>
                      <span className="w-28 font-mono text-[11px] uppercase text-subtext">{mt.label}</span>
                      <span className={cn("font-mono text-[13px]", mt.dir === 1 ? "text-severity-low" : mt.dir === -1 ? "text-severity-high" : "text-foreground")}>{mt.dir === 1 ? "+" : mt.dir === -1 ? "−" : ""}{m.quantity}</span>
                      <span className="ml-auto font-mono text-[11px] text-hint">{m.reference_number ?? ""}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="demand">
            <div className="max-w-3xl">
              <div className="mb-4 inline-flex items-center gap-2 border border-primary/30 bg-primary/5 px-3 py-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-primary" />
                <span className="font-mono text-[12px] text-foreground">{data.demand.predicted_demand} active prediction{data.demand.predicted_demand === 1 ? "" : "s"} on compatible aircraft</span>
              </div>
              <p className="eyebrow mb-2">Consumption (last 12 months)</p>
              {data.demand.monthly.length === 0 ? <p className="text-sm text-hint">No consumption recorded.</p> : (
                <div className="flex h-40 items-end gap-1.5 border-b border-l border-border pl-2 pb-0">
                  {data.demand.monthly.map((m) => (
                    <div key={m.month} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${m.month}: ${m.consumed}`}>
                      <div className="w-full bg-primary/70" style={{ height: `${(Number(m.consumed) / maxMonthly) * 100}%`, minHeight: 2 }} />
                      <span className="font-mono text-[8px] text-hint">{m.month.slice(5)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="aircraft">
            {data.compatible_aircraft.length === 0 ? <p className="text-sm text-hint">No compatible aircraft in the fleet.</p> : (
              <div className="flex max-w-3xl flex-wrap gap-2">
                {data.compatible_aircraft.map((a) => (
                  <Link key={a.id} href={`/aircraft/${a.id}`} className="border border-border bg-card px-3 py-2 hover:border-border-strong">
                    <MonoText className="text-sm text-primary">{a.tail_number}</MonoText>
                    <span className="ml-2 text-[12px] text-hint">{a.aircraft_type}</span>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
