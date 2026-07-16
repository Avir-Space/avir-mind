"use client";

import { FileText, Package, PackageCheck } from "lucide-react";
import Link from "next/link";

import { useToast } from "@/components/ui/use-toast";
import { usePartDetail } from "@/lib/queries/use-inventory";
import { useInventoryActions } from "@/lib/mutations/use-inventory-actions";
import type { Signal } from "@/types/signals";

/** Inventory-aware footer for signal cards whose category is inventory-related.
 *  Surfaces the referenced part, its live stock, and quick actions. */
export function InventorySignalExtra({ signal }: { signal: Signal }) {
  const partRef = (signal.evidence_refs?.primary ?? []).find((e) => e.type === "part" && e.id);
  const partId = partRef?.id ?? "";
  const { data } = usePartDetail(partId);
  const { reserveStock } = useInventoryActions();
  const { toast } = useToast();

  const totalAvail = data?.holdings.reduce((s, h) => s + h.quantity_available, 0) ?? null;
  const topHolding = data?.holdings.slice().sort((a, b) => b.quantity_available - a.quantity_available)[0];

  return (
    <div className="mt-4 border border-primary/30 bg-primary/5 p-3">
      <p className="eyebrow mb-2 inline-flex items-center gap-1.5 text-primary"><Package className="h-3 w-3" /> Inventory</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {partId ? (
          <Link href={`/inventory/parts/${partId}`} className="font-mono text-[13px] text-primary hover:underline">{partRef?.reference}</Link>
        ) : (
          <span className="font-mono text-[13px] text-body">{partRef?.reference ?? "—"}</span>
        )}
        {totalAvail != null && <span className="font-mono text-[11px] text-hint">{totalAvail} in stock across {data?.holdings.length} location{data?.holdings.length === 1 ? "" : "s"}</span>}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!topHolding || reserveStock.isPending}
          onClick={() => {
            if (!topHolding) return;
            reserveStock.mutate(
              { partId, locationId: topHolding.location_id, quantity: 1 },
              { onSuccess: () => toast({ title: "Stock reserved", description: `1 unit reserved at ${topHolding.location_code}.` }) },
            );
          }}
          className="inline-flex items-center gap-1.5 border border-primary px-2.5 py-1 text-xs text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-40"
        >
          <PackageCheck className="h-3.5 w-3.5" /> Reserve stock
        </button>
        <button
          type="button"
          onClick={() => toast({ title: "PO request noted", description: "Raise the formal purchase task from the Command Center queue." })}
          className="inline-flex items-center gap-1.5 border border-border px-2.5 py-1 text-xs text-body transition-colors hover:border-border-strong"
        >
          <FileText className="h-3.5 w-3.5" /> Create PO request
        </button>
      </div>
    </div>
  );
}
