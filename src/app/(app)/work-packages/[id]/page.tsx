"use client";

import { ChevronLeft, Loader2, Plus, Send } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { PageHeader } from "@/components/avir/page-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { findingSeverity, PACKAGE_TYPE_LABEL, usd, wpStatus, WP_STATUS } from "@/lib/design/mro";
import { useMroActions } from "@/lib/mutations/use-mro-actions";
import { useWorkPackageDetail } from "@/lib/queries/use-mro";

const dt = (x: string | null) => (x ? new Date(x).toLocaleString() : "—");
type J = Record<string, unknown>;

export default function WorkPackageDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useWorkPackageDetail(id);
  const { transitionWorkPackage, recordFinding, notifyFinding } = useMroActions();
  const { toast } = useToast();
  const [findingOpen, setFindingOpen] = useState(false);
  const [fDesc, setFDesc] = useState(""); const [fSev, setFSev] = useState("moderate"); const [fType, setFType] = useState("unscheduled_discovery");

  if (isLoading || !data) return <div className="p-6"><Skeleton className="h-9 w-64" /><div className="mt-4 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div></div>;
  const wp = data.work_package as J; const ac = data.aircraft as J; const cust = data.customer as J; const contract = data.contract as J;
  const findings = (data.findings as J[]) ?? [];
  const wipCost = Number(wp.labor_cost_actual_usd ?? 0) + Number(wp.parts_cost_actual_usd ?? 0) + Number(wp.other_costs_usd ?? 0);

  function submitFinding() {
    recordFinding.mutate({ work_package_id: id, finding_type: fType, severity: fSev, description: fDesc } as J, {
      onSuccess: () => { toast({ title: "Finding recorded" }); setFindingOpen(false); setFDesc(""); },
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-4"><Link href="/work-packages" className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-label hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /> Work Packages</Link></div>
      <PageHeader eyebrow={String(wp.work_package_number)} title={String(wp.title)}
        subtitle={`${ac ? String(ac.tail_number) : ""} · ${cust ? String(cust.name) : ""}${contract ? ` · ${String(contract.number)}` : ""}`}
        actions={
          <div className="flex items-center gap-2">
            <Select value={String(wp.status)} onValueChange={(v) => transitionWorkPackage.mutate({ id, status: v }, { onSuccess: () => toast({ title: "Status updated" }) })}>
              <SelectTrigger className="h-8 w-48"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(WP_STATUS).map(([v, x]) => <SelectItem key={v} value={v}>{x.label}</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" onClick={() => setFindingOpen(true)}><Plus className="h-3.5 w-3.5" /> Finding</Button>
          </div>
        } />

      <div className="flex-1 overflow-y-auto avir-scroll">
        <div className="grid grid-cols-2 gap-3 px-6 pt-4 lg:grid-cols-4">
          <Tile label="Status" value={wpStatus(String(wp.status)).label} tone="" />
          <Tile label="Type" value={PACKAGE_TYPE_LABEL[String(wp.package_type)] ?? String(wp.package_type)} />
          <Tile label="WIP cost" value={usd(wipCost)} />
          <Tile label="Labor hrs (act/plan)" value={`${wp.labor_hours_actual ?? 0}/${wp.labor_hours_planned ?? 0}`} />
        </div>

        <Tabs defaultValue="overview" className="mt-5">
          <div className="border-b border-border px-6"><TabsList className="w-full justify-start">
            <TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="findings">Findings ({findings.length})</TabsTrigger>
            <TabsTrigger value="financial">Financial</TabsTrigger>
          </TabsList></div>

          <TabsContent value="overview"><div className="p-6 space-y-3">
            {wp.description ? <p className="text-sm text-subtext">{String(wp.description)}</p> : null}
            <div className="grid grid-cols-2 gap-3 font-mono text-[12px] sm:grid-cols-4">
              <Field label="Planned start" v={dt(wp.planned_start_utc as string | null)} />
              <Field label="Actual start" v={dt(wp.actual_start_utc as string | null)} />
              <Field label="Planned completion" v={dt(wp.planned_completion_utc as string | null)} />
              <Field label="Actual completion" v={dt(wp.actual_completion_utc as string | null)} />
            </div>
          </div></TabsContent>

          <TabsContent value="findings"><div className="p-6"><div className="border border-border">
            {findings.map((f) => {
              const sev = findingSeverity(String(f.severity));
              return (
                <div key={String(f.id)} className="border-b border-border/60 px-3 py-2.5 last:border-b-0" style={{ borderLeft: `3px solid ${sev.hex}` }}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-mono text-[10px] uppercase" style={{ color: sev.hex }}>{sev.label}</span>
                    <span className="text-[12px] text-hint">{String(f.finding_type).replace(/_/g, " ")}</span>
                    <span className="ml-auto font-mono text-[11px] text-hint">{String(f.resolution_status ?? "pending")}</span>
                    {f.customer_notified ? <span className="font-mono text-[10px] text-severity-low">notified</span> :
                      <Button size="sm" variant="outline" onClick={() => notifyFinding.mutate(String(f.id), { onSuccess: () => toast({ title: "Customer notified", description: "Draft findings report created." }) })}><Send className="h-3 w-3" /> Notify customer</Button>}
                  </div>
                  <p className="mt-1 text-[13px] text-foreground">{String(f.description)}</p>
                  {f.recommended_action ? <p className="mt-0.5 text-[12px] text-subtext">→ {String(f.recommended_action)}</p> : null}
                  {Number(f.estimated_additional_cost_usd) > 0 && <p className="mt-0.5 font-mono text-[11px] text-severity-high">+{usd(f.estimated_additional_cost_usd as number)} est. additional</p>}
                </div>
              );
            })}
            {findings.length === 0 && <p className="px-3 py-3 text-sm text-hint">No findings recorded.</p>}
          </div></div></TabsContent>

          <TabsContent value="financial"><div className="p-6"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="Labor cost" value={usd(wp.labor_cost_actual_usd as number)} />
            <Tile label="Parts cost" value={usd(wp.parts_cost_actual_usd as number)} />
            <Tile label="Other costs" value={usd(wp.other_costs_usd as number)} />
            <Tile label="Total WIP" value={usd(wipCost)} tone="text-primary" />
          </div>
          <p className="mt-3 text-[12px] text-hint">Billable: {wp.billable ? "yes" : "no"}{wp.customer_approval_required ? " · customer approval required" : ""}</p>
          </div></TabsContent>
        </Tabs>
      </div>

      <Dialog open={findingOpen} onOpenChange={setFindingOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record finding</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><p className="eyebrow mb-1">Type</p><Select value={fType} onValueChange={setFType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["routine_inspection_finding","unscheduled_discovery","damage_found","wear_beyond_limits","corrosion","quality_escape","warranty_claim_candidate"].map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g," ")}</SelectItem>)}</SelectContent></Select></div>
              <div><p className="eyebrow mb-1">Severity</p><Select value={fSev} onValueChange={setFSev}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["minor","moderate","major","critical"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div><p className="eyebrow mb-1">Description</p><Input value={fDesc} onChange={(e) => setFDesc(e.target.value)} placeholder="What was found" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFindingOpen(false)}>Cancel</Button>
            <Button disabled={!fDesc || recordFinding.isPending} onClick={submitFinding}>{recordFinding.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Record</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return <div className="border border-border bg-card px-5 py-4"><p className={`font-mono text-lg leading-none ${tone ?? "text-foreground"}`}>{value}</p><p className="mt-1.5 font-mono text-eyebrow uppercase text-label">{label}</p></div>;
}
function Field({ label, v }: { label: string; v: string }) {
  return <div><p className="text-hint">{label}</p><p className="text-foreground">{v}</p></div>;
}
