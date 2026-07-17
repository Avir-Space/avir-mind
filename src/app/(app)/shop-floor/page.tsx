"use client";

import { Wrench } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { MonoText } from "@/components/avir/mono-text";
import { PageHeader } from "@/components/avir/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { assignmentStatus, SHOP_COLUMNS } from "@/lib/design/mro";
import { useShopFloor } from "@/lib/queries/use-mro";
import { cn } from "@/lib/utils";

const dd = (x: string | null) => (x ? new Date(x).toLocaleDateString([], { month: "short", day: "numeric" }) : "—");

export default function ShopFloorPage() {
  const { data: rows, isLoading } = useShopFloor();
  const [cust, setCust] = useState("all");
  const customers = useMemo(() => Array.from(new Set((rows ?? []).map((r) => String(r.customer_name)))).sort(), [rows]);
  const filtered = (rows ?? []).filter((r) => cust === "all" || r.customer_name === cust);
  const released = filtered.filter((r) => r.shop_status === "released");

  return (
    <div className="flex h-full flex-col">
      <PageHeader eyebrow="MRO" title="Shop Floor" subtitle="Customer aircraft in service, by shop status."
        actions={
          <select value={cust} onChange={(e) => setCust(e.target.value)} className="h-8 border border-input bg-transparent px-2 text-sm text-foreground focus:border-primary focus:outline-none">
            <option value="all">All customers</option>{customers.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        } />

      <div className="flex-1 overflow-x-auto avir-scroll p-6">
        {isLoading ? <div className="flex gap-3">{SHOP_COLUMNS.map((c) => <Skeleton key={c.key} className="h-64 w-64" />)}</div> : (rows?.length ?? 0) === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center"><Wrench className="h-8 w-8 text-label" strokeWidth={1.5} /><p className="mt-3 text-sm text-subtext">No aircraft in service. Assign a customer aircraft to get started.</p></div>
        ) : (
          <div className="flex gap-3">
            {SHOP_COLUMNS.map((col) => {
              const cards = filtered.filter((r) => r.shop_status === col.key);
              return (
                <div key={col.key} className="flex w-64 shrink-0 flex-col">
                  <div className="mb-2 flex items-center justify-between border-b-2 px-1 pb-1.5" style={{ borderColor: assignmentStatus(col.key).hex }}>
                    <span className="font-mono text-eyebrow uppercase text-label">{col.label}</span>
                    <span className="font-mono text-[11px] text-hint">{cards.length}</span>
                  </div>
                  <div className="space-y-2">
                    {cards.map((r) => {
                      const tat = r.tat_progress_pct as number | null;
                      return (
                        <div key={String(r.id)} className="border border-border bg-card p-3">
                          <div className="flex items-center justify-between">
                            <MonoText className="text-[13px] text-foreground">{String(r.tail_number)}</MonoText>
                            <span className="font-mono text-[10px] text-hint">{String(r.aircraft_type)}</span>
                          </div>
                          <Link href={`/customers/${r.customer_id}`} className="mt-0.5 block text-[12px] text-primary hover:underline">{String(r.customer_name)}</Link>
                          <p className="mt-1 text-[11px] text-subtext">{String(r.primary_service_purpose ?? "—")}</p>
                          <div className="mt-1.5 flex items-center gap-2 font-mono text-[10px] text-hint">
                            <span>{String(r.assigned_hangar ?? "")} {String(r.assigned_bay ?? "")}</span>
                            <span className="ml-auto">rel {dd(r.planned_release_utc as string | null)}</span>
                          </div>
                          {tat != null && (
                            <div className="mt-1.5"><div className="h-1.5 overflow-hidden bg-surface"><div className="h-full" style={{ width: `${Math.min(100, tat)}%`, background: tat >= 90 ? "#DC2626" : tat >= 75 ? "#EA580C" : "#16A34A" }} /></div>
                              <p className="mt-0.5 font-mono text-[9px] text-hint">TAT {tat}%{r.work_package_count ? ` · ${r.work_package_count} WP` : ""}</p></div>
                          )}
                        </div>
                      );
                    })}
                    {cards.length === 0 && <p className="px-1 py-2 font-mono text-[11px] text-hint">—</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {released.length > 0 && <p className="mt-4 font-mono text-[11px] text-hint">{released.length} released today · not shown above</p>}
      </div>
    </div>
  );
}
