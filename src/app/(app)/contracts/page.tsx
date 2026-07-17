"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { MonoText } from "@/components/avir/mono-text";
import { PageHeader } from "@/components/avir/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { contractStatus, CONTRACT_TYPE_LABEL, usd } from "@/lib/design/mro";
import { useContracts } from "@/lib/queries/use-mro";

const dd = (x: string | null) => (x ? new Date(x).toLocaleDateString() : "—");

export default function ContractsPage() {
  const { data: contracts, isLoading } = useContracts();
  const [f, setF] = useState<"all" | "expiring">("all");
  const rows = (contracts ?? []).filter((c) => f === "all" || c.expiring_soon);

  return (
    <div className="flex h-full flex-col">
      <PageHeader eyebrow="MRO" title="Contracts" subtitle="Service agreements, SLAs, and coverage."
        actions={
          <div className="inline-flex border border-border">
            {(["all", "expiring"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setF(k)} className={`border-r border-border px-2.5 py-1 text-xs transition-colors last:border-r-0 ${f === k ? "bg-primary text-primary-foreground" : "text-subtext hover:text-foreground"}`}>{k === "all" ? "All" : "Expiring ≤60d"}</button>
            ))}
          </div>
        } />
      <div className="flex-1 overflow-y-auto avir-scroll p-6">
        {isLoading ? <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div> : (
          <Table>
            <TableHeader><TableRow className="hover:bg-transparent">
              <TableHead>Contract</TableHead><TableHead>Customer</TableHead><TableHead>Type</TableHead>
              <TableHead>Effective</TableHead><TableHead>Value/yr</TableHead><TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={String(c.id)}>
                  <TableCell className="py-0"><Link href={`/contracts/${c.id}`} className="flex items-center gap-1.5 py-3.5"><MonoText className="text-primary">{String(c.contract_number)}</MonoText>{Boolean(c.expiring_soon) && <AlertTriangle className="h-3 w-3 text-severity-high" />}</Link></TableCell>
                  <TableCell className="text-[13px] text-subtext">{String(c.customer_name)}</TableCell>
                  <TableCell className="text-[12px] text-hint">{CONTRACT_TYPE_LABEL[String(c.contract_type)] ?? String(c.contract_type)}</TableCell>
                  <TableCell className="font-mono text-[11px] text-hint">{dd(c.effective_from as string)} → {dd(c.effective_to as string | null)}</TableCell>
                  <TableCell className="font-mono text-[12px] text-foreground">{usd(c.annual_value_usd as number)}</TableCell>
                  <TableCell><span className="font-mono text-[11px] uppercase" style={{ color: contractStatus(String(c.contract_status)).hex }}>{contractStatus(String(c.contract_status)).label}</span></TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && <TableRow><TableCell colSpan={6} className="py-6 text-center text-sm text-hint">No contracts.</TableCell></TableRow>}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
