"use client";

import { FlaskConical, Plus } from "lucide-react";
import Link from "next/link";

import { MonoText } from "@/components/avir/mono-text";
import { PageHeader } from "@/components/avir/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { backtestStatus, PURPOSE_LABEL } from "@/lib/design/backtest";
import { useBacktestProjects } from "@/lib/queries/use-backtest";

const d = (x: string | null) => (x ? new Date(x).toLocaleDateString() : "—");

export default function BacktestListPage() {
  const { data: projects, isLoading } = useBacktestProjects();

  return (
    <div className="flex h-full flex-col">
      <PageHeader eyebrow="Sales" title="Simulation Backtest" subtitle="Replay historical operations through AVIR."
        actions={<Button asChild size="sm"><Link href="/backtest/new"><Plus className="h-3.5 w-3.5" /> New Project</Link></Button>} />

      <div className="flex-1 overflow-y-auto avir-scroll p-6">
        {isLoading ? <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div> : (projects?.length ?? 0) === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <FlaskConical className="h-8 w-8 text-label" strokeWidth={1.5} />
            <p className="mt-3 text-sm text-subtext">No backtest projects yet.</p>
            <Button asChild size="sm" className="mt-4"><Link href="/backtest/new"><Plus className="h-3.5 w-3.5" /> New Project</Link></Button>
          </div>
        ) : (
          <Table>
            <TableHeader><TableRow className="hover:bg-transparent">
              <TableHead>Project</TableHead><TableHead>Customer</TableHead><TableHead>Purpose</TableHead>
              <TableHead>Data period</TableHead><TableHead>Sources</TableHead><TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(projects ?? []).map((p) => {
                const st = backtestStatus(p.status);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="py-0"><Link href={`/backtest/${p.id}`} className="flex items-center py-3.5 text-primary hover:underline">{p.project_name}</Link></TableCell>
                    <TableCell className="text-[13px] text-subtext">{p.customer_organization_name ?? "—"}</TableCell>
                    <TableCell className="text-[12px] text-hint">{p.purpose ? PURPOSE_LABEL[p.purpose] : "—"}</TableCell>
                    <TableCell className="font-mono text-[11px] text-hint">{d(p.data_period_start)} → {d(p.data_period_end)}</TableCell>
                    <TableCell><MonoText muted>{p.source_count ?? 0}</MonoText></TableCell>
                    <TableCell><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: st.hex }} /><span className="text-[13px]" style={{ color: st.hex }}>{st.label}</span></span></TableCell>
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
