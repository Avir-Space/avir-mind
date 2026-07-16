"use client";

import { CalendarClock, Table2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/avir/empty-state";
import { MonoText } from "@/components/avir/mono-text";
import { PageHeader } from "@/components/avir/page-header";
import { FilterDropdown } from "@/components/signals/filter-dropdown";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ASSET_STATUS, ASSET_TYPE, assetStatus, assetType } from "@/lib/design/inventory";
import { useAssets, useAssetServiceCalendar } from "@/lib/queries/use-inventory";
import { useTaskRealtime } from "@/lib/realtime/use-task-realtime";
import { useAuth } from "@/lib/providers/auth-provider";
import { cn } from "@/lib/utils";
import type { AssetRow } from "@/types/inventory";

export default function AssetsPage() {
  const { orgId } = useAuth();
  useTaskRealtime(orgId);
  const { data: assets, isLoading } = useAssets();
  const { data: calendar } = useAssetServiceCalendar(90);
  const [view, setView] = useState<"table" | "calendar">("table");
  const [types, setTypes] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);

  const rows = useMemo(() => {
    let list = (assets ?? []) as unknown as AssetRow[];
    if (types.length) list = list.filter((a) => a.asset_type && types.includes(a.asset_type));
    if (statuses.length) list = list.filter((a) => statuses.includes(a.current_status));
    return list;
  }, [assets, types, statuses]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        eyebrow="Assets"
        title="Assets"
        subtitle="Ground support equipment, tooling, and calibrated instruments."
        actions={
          <div className="inline-flex border border-border">
            <button type="button" onClick={() => setView("table")} className={cn("inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs", view === "table" ? "bg-primary text-primary-foreground" : "text-subtext hover:text-foreground")}><Table2 className="h-3.5 w-3.5" /> Registry</button>
            <button type="button" onClick={() => setView("calendar")} className={cn("inline-flex items-center gap-1.5 border-l border-border px-2.5 py-1.5 text-xs", view === "calendar" ? "bg-primary text-primary-foreground" : "text-subtext hover:text-foreground")}><CalendarClock className="h-3.5 w-3.5" /> Calendar</button>
          </div>
        }
      />

      {view === "table" && (
        <div className="flex h-12 items-center gap-3 border-b border-border px-6">
          <FilterDropdown label="Type" options={Object.entries(ASSET_TYPE).map(([v, x]) => ({ value: v, label: x.label }))} selected={types} onChange={setTypes} />
          <FilterDropdown label="Status" options={Object.entries(ASSET_STATUS).map(([v, x]) => ({ value: v, label: x.label }))} selected={statuses} onChange={setStatuses} />
        </div>
      )}

      <div className="flex-1 overflow-y-auto avir-scroll">
        {isLoading ? (
          <div className="space-y-2 p-6">{Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
        ) : view === "table" ? (
          <Table>
            <TableHeader><TableRow className="hover:bg-transparent">
              <TableHead>Tag</TableHead><TableHead>Name</TableHead><TableHead>Type</TableHead>
              <TableHead>Status</TableHead><TableHead>Station</TableHead><TableHead>Calibration Due</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((a) => {
                const at = assetType(a.asset_type);
                const stt = assetStatus(a.current_status);
                return (
                  <TableRow key={a.id} className="cursor-pointer">
                    <TableCell className="py-0"><Link href={`/assets/${a.id}`} className="flex items-center py-3.5 text-primary hover:underline"><MonoText className="text-primary">{a.asset_tag}</MonoText></Link></TableCell>
                    <TableCell className="text-foreground">{a.asset_name}</TableCell>
                    <TableCell><span className="inline-flex items-center gap-1.5 text-subtext"><at.icon className="h-3.5 w-3.5 text-label" /> {at.label}</span></TableCell>
                    <TableCell><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: stt.hex }} /><span className="text-[13px]" style={{ color: stt.hex }}>{stt.label}</span></span></TableCell>
                    <TableCell><MonoText muted>{a.assigned_to_station ?? "—"}</MonoText></TableCell>
                    <TableCell><MonoText muted className="text-[12px]">{a.calibration_due_date ?? "—"}</MonoText></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <div className="p-6">
            <p className="eyebrow mb-3">Upcoming calibration &amp; service (next 90 days)</p>
            {!calendar || calendar.length === 0 ? (
              <EmptyState icon={CalendarClock} headline="Nothing due"><p>No calibrations or services due in the next 90 days.</p></EmptyState>
            ) : (
              <div className="border border-border">
                {calendar.map((c) => {
                  const overdue = new Date(c.due_date) < new Date();
                  return (
                    <Link key={c.id} href={`/assets/${c.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 px-3 py-2 last:border-b-0 hover:bg-surface/40">
                      <span className={cn("w-24 font-mono text-[12px]", overdue ? "text-severity-critical" : "text-foreground")}>{c.due_date}</span>
                      <span className="font-mono text-[11px] uppercase text-label">{c.due_type}</span>
                      <MonoText className="text-[12px] text-primary">{c.asset_tag}</MonoText>
                      <span className="text-[13px] text-subtext">{c.asset_name}</span>
                      <span className="ml-auto font-mono text-[11px] text-hint">{c.assigned_to_station ?? "—"}</span>
                      {overdue && <span className="font-mono text-[10px] uppercase text-severity-critical">overdue</span>}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
