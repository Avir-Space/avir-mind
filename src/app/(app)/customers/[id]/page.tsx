"use client";

import { ChevronLeft, FileText, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { MonoText } from "@/components/avir/mono-text";
import { PageHeader } from "@/components/avir/page-header";
import { CreateContractDialog } from "@/components/mro/create-contract-dialog";
import { CustomerReportView, type CustomerReport } from "@/components/mro/customer-report-view";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { assignmentStatus, contractStatus, CONTRACT_TYPE_LABEL, usd, wpStatus } from "@/lib/design/mro";
import { useMroActions } from "@/lib/mutations/use-mro-actions";
import { useCustomerDashboard, useCustomerReports } from "@/lib/queries/use-mro";
import { useAuth } from "@/lib/providers/auth-provider";

const dd = (x: string | null) => (x ? new Date(x).toLocaleDateString() : "—");
type J = Record<string, unknown>;

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useCustomerDashboard(id);
  const { data: fullReports } = useCustomerReports(id);
  const { generateReport } = useMroActions();
  const { toast } = useToast();
  const { orgRole } = useAuth();
  const canEdit = orgRole !== "viewer" && orgRole !== null;

  const [viewReportId, setViewReportId] = useState<string | null>(null);
  const [addContract, setAddContract] = useState(false);

  if (isLoading || !data) return <div className="p-6"><Skeleton className="h-9 w-64" /><div className="mt-4 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div></div>;
  const c = data.customer as J; const fin = data.financial as J;
  const contracts = (data.contracts as J[]) ?? []; const assignments = (data.assignments as J[]) ?? [];
  const wps = (data.work_packages as J[]) ?? []; const sla = (data.sla as J[]) ?? [];
  const reports = (fullReports ?? []) as J[];
  const viewReport = viewReportId ? (reports.find((r) => String(r.id) === viewReportId) as unknown as CustomerReport | undefined) : undefined;

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-4"><Link href="/customers" className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-label hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /> Customers</Link></div>
      <PageHeader eyebrow={String(c.customer_code)} title={String(c.customer_name)} subtitle={`${String(c.customer_type)} · ${String(c.customer_status)} · ${String(c.payment_terms ?? "")}`}
        actions={canEdit ? <Button size="sm" onClick={() => generateReport.mutate({ customerId: id }, { onSuccess: (newId) => { toast({ title: "Report generated" }); setViewReportId(String(newId)); } })}>{generateReport.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} Monthly report</Button> : undefined} />

      <div className="flex-1 overflow-y-auto avir-scroll">
        <div className="grid grid-cols-2 gap-3 px-6 pt-4 lg:grid-cols-4">
          <Tile label="WIP" value={usd(fin.wip_cost_usd as number)} />
          <Tile label="Annual contract value" value={usd(fin.annual_contract_value_usd as number)} />
          <Tile label="Credits owed" value={usd(fin.credits_owed_usd as number)} tone={Number(fin.credits_owed_usd) > 0 ? "text-severity-high" : undefined} />
          <Tile label="Aircraft in service" value={assignments.filter((a) => ["arrived", "in_service", "ready_for_release"].includes(String(a.status))).length} />
        </div>

        <Tabs defaultValue="contracts" className="mt-5">
          <div className="border-b border-border px-6"><TabsList className="w-full justify-start">
            <TabsTrigger value="contracts">Contracts</TabsTrigger><TabsTrigger value="aircraft">Aircraft</TabsTrigger>
            <TabsTrigger value="work">Work Packages</TabsTrigger><TabsTrigger value="sla">SLA</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
          </TabsList></div>

          <TabsContent value="contracts"><div className="p-6">
            {canEdit && <div className="mb-3 flex justify-end"><Button size="sm" variant="outline" onClick={() => setAddContract(true)}><Plus className="h-3.5 w-3.5" /> New contract</Button></div>}
            <div className="border border-border">
            {contracts.map((k) => (
              <Link key={String(k.id)} href={`/contracts/${k.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 px-3 py-2.5 last:border-b-0 hover:bg-surface/40">
                <MonoText className="text-[12px] text-primary">{String(k.contract_number)}</MonoText>
                <span className="flex-1 truncate text-[12px] text-foreground">{String(k.contract_name)}</span>
                <span className="font-mono text-[11px] text-hint">{CONTRACT_TYPE_LABEL[String(k.contract_type)] ?? String(k.contract_type)}</span>
                <span className="font-mono text-[11px] text-foreground">{usd(k.annual_value_usd as number)}/yr</span>
                <span className="font-mono text-[10px] uppercase" style={{ color: contractStatus(String(k.contract_status)).hex }}>{contractStatus(String(k.contract_status)).label}</span>
              </Link>
            ))}
            {contracts.length === 0 && <p className="px-3 py-3 text-sm text-hint">No contracts.</p>}
          </div></div></TabsContent>

          <TabsContent value="aircraft"><div className="p-6"><div className="border border-border">
            {assignments.map((a) => (
              <div key={String(a.id)} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 px-3 py-2.5 last:border-b-0">
                <MonoText className="text-[12px] text-foreground">{String(a.tail_number)}</MonoText>
                <span className="text-[11px] text-hint">{String(a.aircraft_type)}</span>
                <span className="flex-1 truncate text-[12px] text-subtext">{String(a.purpose ?? "—")}</span>
                <span className="font-mono text-[11px] text-hint">rel {dd(a.planned_release_utc as string | null)}</span>
                <span className="font-mono text-[10px] uppercase" style={{ color: assignmentStatus(String(a.status)).hex }}>{assignmentStatus(String(a.status)).label}</span>
              </div>
            ))}
            {assignments.length === 0 && <p className="px-3 py-3 text-sm text-hint">No aircraft.</p>}
          </div></div></TabsContent>

          <TabsContent value="work"><div className="p-6"><div className="border border-border">
            {wps.map((w) => (
              <Link key={String(w.id)} href={`/work-packages/${w.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 px-3 py-2.5 last:border-b-0 hover:bg-surface/40">
                <MonoText className="text-[12px] text-primary">{String(w.number)}</MonoText>
                <span className="flex-1 truncate text-[12px] text-foreground">{String(w.title)}</span>
                <span className="font-mono text-[11px] text-foreground">{usd(w.wip_cost as number)}</span>
                <span className="font-mono text-[10px] uppercase" style={{ color: wpStatus(String(w.status)).hex }}>{wpStatus(String(w.status)).label}</span>
              </Link>
            ))}
            {wps.length === 0 && <p className="px-3 py-3 text-sm text-hint">No work packages.</p>}
          </div></div></TabsContent>

          <TabsContent value="sla"><div className="p-6 space-y-2">
            {sla.map((m) => (
              <div key={String(m.id)} className="flex flex-wrap items-center gap-x-4 border border-border bg-card px-3 py-2.5">
                <span className="w-40 text-[12px] text-foreground">{String(m.sla_type).replace(/_/g, " ")}</span>
                <span className="font-mono text-[11px] text-hint">target {String(m.target_value)} · actual {String(m.actual_value)} {String(m.unit ?? "")}</span>
                <span className="ml-auto font-mono text-[12px]" style={{ color: Number(m.performance_pct) >= 100 ? "#16A34A" : "#EA580C" }}>{String(m.performance_pct)}%</span>
                {Number(m.credits_owed_usd) > 0 && <span className="font-mono text-[11px] text-severity-high">{usd(m.credits_owed_usd as number)} credit</span>}
              </div>
            ))}
            {sla.length === 0 && <p className="text-sm text-hint">No SLA measurements.</p>}
          </div></TabsContent>

          <TabsContent value="reports"><div className="p-6"><div className="border border-border">
            {reports.map((r) => (
              <button key={String(r.id)} type="button" onClick={() => setViewReportId(String(r.id))} className="flex w-full items-center gap-x-4 border-b border-border/60 px-3 py-2.5 text-left last:border-b-0 hover:bg-surface/40">
                <FileText className="h-3.5 w-3.5 text-label" /><span className="text-[13px] text-primary">{String(r.report_type).replace(/_/g, " ")}</span>
                <span className="ml-auto font-mono text-[11px] text-hint">{String(r.report_status ?? r.status ?? "")}</span>
                <span className="font-mono text-[11px] text-hint">{r.generated_at_utc ? new Date(String(r.generated_at_utc)).toLocaleDateString() : "—"}</span>
              </button>
            ))}
            {reports.length === 0 && <p className="px-3 py-3 text-sm text-hint">No reports.</p>}
          </div></div></TabsContent>
        </Tabs>
      </div>

      {/* Generated report viewer (print → PDF) */}
      <Dialog open={Boolean(viewReport)} onOpenChange={(o) => !o && setViewReportId(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto avir-scroll p-0">
          {viewReport && <CustomerReportView report={viewReport} />}
        </DialogContent>
      </Dialog>

      <CreateContractDialog open={addContract} onOpenChange={setAddContract} customerAccountId={id} />
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return <div className="border border-border bg-card px-5 py-4"><p className={`font-mono text-xl leading-none ${tone ?? "text-foreground"}`}>{value}</p><p className="mt-1.5 font-mono text-eyebrow uppercase text-label">{label}</p></div>;
}
