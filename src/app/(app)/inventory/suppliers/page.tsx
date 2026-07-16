"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/avir/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { APPROVED_STATUS, SUPPLIER_TYPE, supplierScoreHex } from "@/lib/design/inventory";
import { useSupplierPerformance } from "@/lib/queries/use-inventory";

export default function SuppliersPage() {
  const { data: suppliers, isLoading } = useSupplierPerformance();

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-4">
        <Link href="/inventory" className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-label hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /> Inventory</Link>
      </div>
      <PageHeader eyebrow="Assets" title="Suppliers" subtitle="Supplier directory and performance." />
      <div className="flex-1 overflow-y-auto avir-scroll">
        {isLoading ? (
          <div className="space-y-2 p-6">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
        ) : (
          <Table>
            <TableHeader><TableRow className="hover:bg-transparent">
              <TableHead>Supplier</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead>
              <TableHead>Performance</TableHead><TableHead>Parts</TableHead><TableHead>Last Order</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(suppliers ?? []).map((s) => {
                const st = APPROVED_STATUS[s.approved_status ?? "approved"] ?? APPROVED_STATUS.approved!;
                return (
                  <TableRow key={s.id} className="cursor-pointer">
                    <TableCell className="py-0"><Link href={`/inventory/suppliers/${s.id}`} className="flex items-center py-3.5 font-medium text-primary hover:underline">{s.supplier_name}</Link></TableCell>
                    <TableCell className="text-subtext">{SUPPLIER_TYPE[s.supplier_type ?? "other"] ?? s.supplier_type}</TableCell>
                    <TableCell><span className="font-mono text-[11px] uppercase" style={{ color: st.hex }}>{st.label}</span></TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-2">
                        <span className="relative h-1.5 w-16 bg-border"><span className="absolute inset-y-0 left-0" style={{ width: `${s.performance_score ?? 0}%`, background: supplierScoreHex(s.performance_score) }} /></span>
                        <span className="font-mono text-xs" style={{ color: supplierScoreHex(s.performance_score) }}>{s.performance_score ?? "—"}</span>
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-[13px]">{s.part_count}</TableCell>
                    <TableCell className="font-mono text-[11px] text-hint">{s.last_order_at_utc ? new Date(s.last_order_at_utc).toLocaleDateString() : "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
