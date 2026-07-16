"use client";

import { ArrowLeftRight, Boxes, Package, TriangleAlert, Warehouse } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/avir/empty-state";
import { MonoText } from "@/components/avir/mono-text";
import { PageHeader } from "@/components/avir/page-header";
import { Button } from "@/components/ui/button";
import { FilterDropdown } from "@/components/signals/filter-dropdown";
import { FilterToggle } from "@/components/tasks/task-filter-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { criticality, locationType, movementType, PART_CATEGORY, partCategory } from "@/lib/design/inventory";
import { SEVERITY_HEX } from "@/lib/design/command-center";
import {
  useInventoryDashboard, useLocationsOverview, useLowStockAlerts, usePartsOverview,
  useRecentMovements, useTransferSuggestions,
} from "@/lib/queries/use-inventory";
import { useTaskRealtime } from "@/lib/realtime/use-task-realtime";
import { useAuth } from "@/lib/providers/auth-provider";
import { cn } from "@/lib/utils";

const money = (n: number | null | undefined) => "$" + Math.round(Number(n ?? 0)).toLocaleString();

function StatTile({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="border border-border bg-card px-5 py-4">
      <p className={cn("font-mono text-2xl leading-none", tone ?? "text-foreground")}>{value}</p>
      <p className="mt-1.5 font-mono text-eyebrow uppercase text-label">{label}</p>
    </div>
  );
}

export default function InventoryPage() {
  const { orgId } = useAuth();
  useTaskRealtime(orgId);
  const { data: dash, isLoading } = useInventoryDashboard();
  const { data: parts } = usePartsOverview();
  const { data: locations } = useLocationsOverview();
  const { data: movements } = useRecentMovements();
  const { data: alerts } = useLowStockAlerts();
  const { data: transfers } = useTransferSuggestions();

  const [cats, setCats] = useState<string[]>([]);
  const [crits, setCrits] = useState<string[]>([]);
  const [lowOnly, setLowOnly] = useState(false);

  const filteredParts = useMemo(() => {
    let list = parts ?? [];
    if (cats.length) list = list.filter((p) => p.category && cats.includes(p.category));
    if (crits.length) list = list.filter((p) => p.criticality && crits.includes(p.criticality));
    if (lowOnly) list = list.filter((p) => p.below_reorder);
    return list;
  }, [parts, cats, crits, lowOnly]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        eyebrow="Assets"
        title="Inventory"
        subtitle="Parts, stock, and supply intelligence."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline"><Link href="/inventory/suppliers">Suppliers</Link></Button>
            <Button asChild size="sm" variant="outline"><Link href="/assets">Assets</Link></Button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto avir-scroll">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 px-6 pt-5 lg:grid-cols-4">
          {isLoading || !dash ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[72px]" />) : (
            <>
              <StatTile label="Total SKUs" value={dash.stats.total_skus} />
              <StatTile label="Inventory Value" value={money(dash.stats.total_value)} />
              <StatTile label="Low Stock Alerts" value={dash.stats.low_stock_count} tone="text-severity-high" />
              <StatTile label="Reorder Needed" value={dash.stats.reorder_count} tone="text-severity-medium" />
            </>
          )}
        </div>

        {/* AI insights */}
        <div className="px-6 py-5">
          <p className="eyebrow mb-2">Supply intelligence</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(dash?.insights ?? []).map((ins, i) => (
              <div key={i} className="flex h-[92px] items-stretch border border-border bg-card">
                <span className="w-1 shrink-0" style={{ background: SEVERITY_HEX[ins.severity] ?? "#6B7280" }} />
                <span className="flex min-w-0 flex-col justify-between px-3 py-2.5">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-label">{ins.title}</span>
                  <span className="line-clamp-2 text-[13px] leading-snug text-foreground">{ins.one_liner}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        <Tabs defaultValue="parts">
          <div className="border-b border-border px-6">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="parts">Parts</TabsTrigger>
              <TabsTrigger value="locations">Locations</TabsTrigger>
              <TabsTrigger value="movements">Movements</TabsTrigger>
              <TabsTrigger value="alerts">Alerts{alerts?.length ? ` (${alerts.length})` : ""}</TabsTrigger>
            </TabsList>
          </div>

          {/* Parts */}
          <TabsContent value="parts">
            <div className="flex h-12 items-center gap-3 border-b border-border px-6">
              <FilterDropdown label="Category" options={Object.entries(PART_CATEGORY).map(([v, x]) => ({ value: v, label: x.label }))} selected={cats} onChange={setCats} />
              <FilterDropdown label="Criticality" options={Object.keys({ ao_g_critical: 0, safety_critical: 0, rotational: 0, standard: 0, low: 0 }).map((v) => ({ value: v, label: criticality(v).label }))} selected={crits} onChange={setCrits} />
              <FilterToggle label="Low stock only" active={lowOnly} onChange={setLowOnly} />
            </div>
            {!parts ? (
              <div className="space-y-2 p-6">{Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (
              <Table>
                <TableHeader><TableRow className="hover:bg-transparent">
                  <TableHead>Part #</TableHead><TableHead>Description</TableHead><TableHead>Category</TableHead>
                  <TableHead>Criticality</TableHead><TableHead>Stock</TableHead><TableHead>Value</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {filteredParts.map((p) => {
                    const cr = criticality(p.criticality);
                    return (
                      <TableRow key={p.id} className="cursor-pointer">
                        <TableCell className="py-0"><Link href={`/inventory/parts/${p.id}`} className="flex items-center py-3.5 text-primary hover:underline"><MonoText className="text-primary">{p.part_number}</MonoText></Link></TableCell>
                        <TableCell className="max-w-[280px] truncate text-foreground">{p.description}</TableCell>
                        <TableCell className="text-subtext">{partCategory(p.category).label}</TableCell>
                        <TableCell><span className="font-mono text-[11px] uppercase" style={{ color: cr.hex }}>{cr.label}</span></TableCell>
                        <TableCell>
                          <span className={cn("font-mono text-[13px]", p.below_reorder ? "text-severity-high" : "text-foreground")}>{p.total_available}</span>
                          {p.below_reorder && <TriangleAlert className="ml-1 inline h-3 w-3 text-severity-high" />}
                        </TableCell>
                        <TableCell><MonoText muted className="text-[12px]">{money(p.total_value)}</MonoText></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          {/* Locations */}
          <TabsContent value="locations">
            <Table>
              <TableHeader><TableRow className="hover:bg-transparent">
                <TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Type</TableHead>
                <TableHead>Parts</TableHead><TableHead>Value</TableHead><TableHead>Low Stock</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(locations ?? []).map((l) => {
                  const lt = locationType(l.location_type as string);
                  return (
                    <TableRow key={l.id} className="cursor-pointer">
                      <TableCell className="py-0"><Link href={`/inventory/locations/${l.id}`} className="flex items-center py-3.5 text-primary hover:underline"><MonoText className="text-primary">{String(l.location_code)}</MonoText></Link></TableCell>
                      <TableCell className="text-foreground">{String(l.location_name)}</TableCell>
                      <TableCell><span className="inline-flex items-center gap-1.5 text-subtext"><lt.icon className="h-3.5 w-3.5 text-label" /> {lt.label}</span></TableCell>
                      <TableCell className="font-mono text-[13px]">{String(l.part_count)}</TableCell>
                      <TableCell><MonoText muted className="text-[12px]">{money(l.total_value as number)}</MonoText></TableCell>
                      <TableCell><span className={cn("font-mono text-[13px]", Number(l.low_stock_count) > 0 ? "text-severity-high" : "text-hint")}>{String(l.low_stock_count)}</span></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TabsContent>

          {/* Movements */}
          <TabsContent value="movements">
            <Table>
              <TableHeader><TableRow className="hover:bg-transparent">
                <TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Part</TableHead>
                <TableHead>Qty</TableHead><TableHead>From → To</TableHead><TableHead>Ref</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(movements ?? []).slice(0, 100).map((m) => {
                  const mt = movementType(String(m.movement_type));
                  return (
                    <TableRow key={m.id} className="hover:bg-surface/40">
                      <TableCell><MonoText muted className="text-[12px]">{new Date(String(m.movement_date_utc)).toLocaleDateString()}</MonoText></TableCell>
                      <TableCell><span className="font-mono text-[11px] uppercase text-subtext">{mt.label}</span></TableCell>
                      <TableCell><Link href={`/inventory/parts/${m.part_id}`} className="font-mono text-[12px] text-primary hover:underline">{String(m.part_number)}</Link></TableCell>
                      <TableCell className={cn("font-mono text-[13px]", mt.dir === 1 ? "text-severity-low" : mt.dir === -1 ? "text-severity-high" : "text-foreground")}>{mt.dir === 1 ? "+" : mt.dir === -1 ? "−" : ""}{String(m.quantity)}</TableCell>
                      <TableCell className="font-mono text-[11px] text-hint">{String(m.from_code ?? "—")} → {String(m.to_code ?? "—")}</TableCell>
                      <TableCell><MonoText muted className="text-[11px]">{String(m.reference_number ?? "—")}</MonoText></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TabsContent>

          {/* Alerts */}
          <TabsContent value="alerts">
            <div className="space-y-6 p-6">
              <section>
                <p className="eyebrow mb-2 inline-flex items-center gap-1.5"><TriangleAlert className="h-3 w-3 text-severity-high" /> Low stock</p>
                {!alerts || alerts.length === 0 ? (
                  <p className="text-sm text-hint">No holdings below reorder point.</p>
                ) : (
                  <div className="border border-border">
                    {alerts.map((a) => (
                      <div key={a.holding_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 px-3 py-2 last:border-b-0">
                        <Link href={`/inventory/parts/${a.part_id}`} className="font-mono text-[13px] text-primary hover:underline">{a.part_number}</Link>
                        <span className="max-w-[240px] truncate text-[13px] text-subtext">{a.description}</span>
                        <span className="font-mono text-[11px] uppercase" style={{ color: criticality(a.criticality).hex }}>{criticality(a.criticality).label}</span>
                        <span className="ml-auto font-mono text-[12px] text-severity-high">{a.quantity_available}/{a.reorder_point} at {a.location_code}</span>
                        {a.days_of_cover != null && <span className="font-mono text-[11px] text-hint">{a.days_of_cover}d cover</span>}
                        <span className="font-mono text-[11px] text-hint">lead {a.typical_lead_time_days ?? "—"}d</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
              <section>
                <p className="eyebrow mb-2 inline-flex items-center gap-1.5"><ArrowLeftRight className="h-3 w-3 text-primary" /> Transfer opportunities</p>
                {!transfers || transfers.length === 0 ? (
                  <p className="text-sm text-hint">No transfer opportunities.</p>
                ) : (
                  <div className="space-y-2">
                    {transfers.slice(0, 10).map((t, i) => (
                      <div key={i} className="border border-border bg-card px-3 py-2 text-[13px] text-body">
                        <span className="font-mono text-primary">{t.part_number}</span> · {t.reasoning}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
