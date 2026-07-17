"use client";

import Link from "next/link";
import { useState } from "react";

import { MonoText } from "@/components/avir/mono-text";
import { PageHeader } from "@/components/avir/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PACKAGE_TYPE_LABEL, usd, wpStatus, WP_STATUS } from "@/lib/design/mro";
import { useWorkPackages } from "@/lib/queries/use-mro";

export default function WorkPackagesPage() {
  const { data: wps, isLoading } = useWorkPackages();
  const [status, setStatus] = useState("all");
  const rows = (wps ?? []).filter((w) => status === "all" || w.status === status);

  return (
    <div className="flex h-full flex-col">
      <PageHeader eyebrow="MRO" title="Work Packages" subtitle="Customer-billable units of shop work."
        actions={
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-8 border border-input bg-transparent px-2 text-sm text-foreground focus:border-primary focus:outline-none">
            <option value="all">All statuses</option>{Object.entries(WP_STATUS).map(([v, x]) => <option key={v} value={v}>{x.label}</option>)}
          </select>
        } />
      <div className="flex-1 overflow-y-auto avir-scroll p-6">
        {isLoading ? <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div> : (
          <Table>
            <TableHeader><TableRow className="hover:bg-transparent">
              <TableHead>WP</TableHead><TableHead>Aircraft</TableHead><TableHead>Customer</TableHead>
              <TableHead>Type</TableHead><TableHead>WIP</TableHead><TableHead>Findings</TableHead><TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((w) => (
                <TableRow key={String(w.id)}>
                  <TableCell className="py-0"><Link href={`/work-packages/${w.id}`} className="flex items-center py-3.5"><MonoText className="text-primary">{String(w.work_package_number)}</MonoText></Link></TableCell>
                  <TableCell><MonoText muted>{String(w.tail_number)}</MonoText></TableCell>
                  <TableCell className="text-[13px] text-subtext">{String(w.customer_name)}</TableCell>
                  <TableCell className="text-[12px] text-hint">{PACKAGE_TYPE_LABEL[String(w.package_type)] ?? String(w.package_type)}</TableCell>
                  <TableCell className="font-mono text-[12px] text-foreground">{usd(w.wip_cost as number)}</TableCell>
                  <TableCell className="font-mono text-[12px]" style={{ color: Number(w.finding_count) > 0 ? "#EA580C" : "#6B7280" }}>{String(w.finding_count ?? 0)}</TableCell>
                  <TableCell><span className="font-mono text-[11px] uppercase" style={{ color: wpStatus(String(w.status)).hex }}>{wpStatus(String(w.status)).label}</span></TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && <TableRow><TableCell colSpan={7} className="py-6 text-center text-sm text-hint">No work packages.</TableCell></TableRow>}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
