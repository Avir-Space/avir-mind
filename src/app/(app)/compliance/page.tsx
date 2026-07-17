"use client";

import { ArrowRight, Bot, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";

import { MonoText } from "@/components/avir/mono-text";
import { PageHeader } from "@/components/avir/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { adCriticality, reportStatus, REPORT_TYPE_LABEL, sbClass } from "@/lib/design/compliance";
import { useComplianceActions } from "@/lib/mutations/use-compliance-actions";
import {
  useComplianceDashboard, useComplianceSignals, useDsaiDashboard, useReportingCalendar,
} from "@/lib/queries/use-compliance";

const d = (x: string | null) => (x ? new Date(x).toLocaleDateString() : "—");
const SEV: Record<string, string> = { critical: "#DC2626", high: "#EA580C", medium: "#CA8A04", low: "#2563EB", info: "#94A3B8" };

function StatTile({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="border border-border bg-card px-5 py-4">
      <p className={`font-mono text-2xl leading-none ${tone ?? "text-foreground"}`}>{value}</p>
      <p className="mt-1.5 font-mono text-eyebrow uppercase text-label">{label}</p>
    </div>
  );
}

export default function CompliancePage() {
  const { data: dash, isLoading } = useComplianceDashboard();
  const { data: dsai } = useDsaiDashboard();
  const { data: signals } = useComplianceSignals();
  const { data: reports } = useReportingCalendar();
  const { fileReport } = useComplianceActions();
  const { toast } = useToast();
  const s = dash?.stats;

  return (
    <div className="flex h-full flex-col">
      <PageHeader eyebrow="Airworthiness" title="Compliance" subtitle="Airworthiness, ADs, SBs, MEL, and regulatory status."
        actions={<Button asChild size="sm" variant="outline"><Link href="/compliance/dsai"><ShieldCheck className="h-3.5 w-3.5" /> DS.AI Audit</Link></Button>} />

      <div className="flex-1 overflow-y-auto avir-scroll">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 px-6 pt-5 lg:grid-cols-5">
          {isLoading || !s ? [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[72px]" />) : (
            <>
              <StatTile label="ADs Open" value={s.ads_open} tone={s.ads_open ? "text-severity-high" : "text-severity-low"} />
              <StatTile label="ADs Due ≤30d" value={s.ads_due_30} tone={s.ads_due_30 ? "text-severity-critical" : "text-foreground"} />
              <StatTile label="MEL Deferred" value={s.mel_deferred} />
              <StatTile label="MEL ≤7d" value={s.mel_approaching} tone={s.mel_approaching ? "text-severity-high" : "text-foreground"} />
              <StatTile label="LLPs ≥85%" value={s.llps_approaching} tone={s.llps_approaching ? "text-severity-high" : "text-foreground"} />
            </>
          )}
        </div>

        {/* AI insights strip */}
        {(signals?.length ?? 0) > 0 && (
          <div className="px-6 pt-4">
            <p className="eyebrow mb-2 inline-flex items-center gap-1.5"><Sparkles className="h-3 w-3" /> Compliance insights</p>
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              {(signals ?? []).slice(0, 6).map((sig) => (
                <Link key={sig.id} href="/signals" className="border border-border bg-card p-3 transition-colors hover:border-border-strong" style={{ borderLeft: `3px solid ${SEV[sig.severity] ?? "#6B7280"}` }}>
                  <p className="text-[13px] font-medium leading-snug text-foreground">{sig.title}</p>
                  <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-subtext">{sig.narrative}</p>
                </Link>
              ))}
            </div>
          </div>
        )}

        <Tabs defaultValue="ads" className="mt-5">
          <div className="border-b border-border px-6"><TabsList className="w-full justify-start">
            <TabsTrigger value="ads">ADs</TabsTrigger>
            <TabsTrigger value="sbs">Service Bulletins</TabsTrigger>
            <TabsTrigger value="mel">MEL</TabsTrigger>
            <TabsTrigger value="llps">Life-Limited Parts</TabsTrigger>
            <TabsTrigger value="reports">Regulatory</TabsTrigger>
            <TabsTrigger value="dsai">DS.AI Audit</TabsTrigger>
          </TabsList></div>

          {/* ADs */}
          <TabsContent value="ads">
            <div className="flex items-center justify-between px-6 py-3">
              <p className="eyebrow">Fleet AD register ({dash?.ads.length ?? 0})</p>
              <Link href="/compliance/ads" className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-primary hover:underline">Tracker &amp; matrix <ArrowRight className="h-3 w-3" /></Link>
            </div>
            <Table>
              <TableHeader><TableRow className="hover:bg-transparent">
                <TableHead>AD</TableHead><TableHead>Authority</TableHead><TableHead>Title</TableHead>
                <TableHead>Deadline</TableHead><TableHead>Compliance</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(dash?.ads ?? []).map((a) => {
                  const cr = adCriticality(a.criticality);
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="py-0"><Link href={`/compliance/ads?ad=${a.id}`} className="flex items-center py-3.5"><MonoText className="text-primary">{a.ad_number}</MonoText></Link></TableCell>
                      <TableCell><span className="font-mono text-[11px] uppercase" style={{ color: cr.hex }}>{a.issuing_authority}</span></TableCell>
                      <TableCell className="max-w-sm truncate text-[13px] text-subtext">{a.ad_title}</TableCell>
                      <TableCell className="font-mono text-[12px] text-hint">{d(a.compliance_deadline_date)}</TableCell>
                      <TableCell><span className="font-mono text-[11px]"><span className="text-severity-low">{a.complied}✓</span> · <span className="text-severity-high">{a.open_count} open</span>{a.deferred_count ? <span className="text-severity-medium"> · {a.deferred_count} def</span> : null}</span></TableCell>
                    </TableRow>
                  );
                })}
                {(dash?.ads.length ?? 0) === 0 && <TableRow><TableCell colSpan={5} className="py-6 text-center text-sm text-hint">No ADs.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </TabsContent>

          {/* SBs */}
          <TabsContent value="sbs">
            <Table>
              <TableHeader><TableRow className="hover:bg-transparent">
                <TableHead>SB</TableHead><TableHead>Manufacturer</TableHead><TableHead>Title</TableHead>
                <TableHead>Class</TableHead><TableHead>Issued</TableHead><TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(dash?.sbs ?? []).map((b) => {
                  const cl = sbClass(b.classification);
                  return (
                    <TableRow key={b.id}>
                      <TableCell><MonoText>{b.sb_number}</MonoText></TableCell>
                      <TableCell className="text-[13px] text-subtext">{b.manufacturer}</TableCell>
                      <TableCell className="max-w-sm truncate text-[13px] text-subtext">{b.sb_title}</TableCell>
                      <TableCell><span className="font-mono text-[11px] uppercase" style={{ color: cl.hex }}>{cl.label}</span></TableCell>
                      <TableCell className="font-mono text-[12px] text-hint">{d(b.issued_date)}</TableCell>
                      <TableCell><span className="font-mono text-[11px]"><span className="text-severity-low">{b.complied}✓</span> · <span className="text-severity-high">{b.open_count} open</span></span></TableCell>
                    </TableRow>
                  );
                })}
                {(dash?.sbs.length ?? 0) === 0 && <TableRow><TableCell colSpan={6} className="py-6 text-center text-sm text-hint">No SBs.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </TabsContent>

          {/* MEL — full mgmt on dedicated page */}
          <TabsContent value="mel">
            <div className="flex items-center justify-between px-6 py-4">
              <p className="text-sm text-subtext">Deferred maintenance items with repair-by intervals, placards, and linked tasks.</p>
              <Button asChild size="sm"><Link href="/compliance/mel">Open MEL management <ArrowRight className="h-3.5 w-3.5" /></Link></Button>
            </div>
          </TabsContent>

          {/* LLPs — dedicated page */}
          <TabsContent value="llps">
            <div className="flex items-center justify-between px-6 py-4">
              <p className="text-sm text-subtext">Hard-life parts by % used and remaining life, most urgent first.</p>
              <Button asChild size="sm"><Link href="/compliance/llps">Open LLP tracker <ArrowRight className="h-3.5 w-3.5" /></Link></Button>
            </div>
          </TabsContent>

          {/* Reports */}
          <TabsContent value="reports">
            <div className="p-6"><div className="border border-border">
              {(reports ?? []).map((r) => {
                const st = reportStatus(r.status);
                return (
                  <div key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 px-3 py-2.5 last:border-b-0">
                    <span className="border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase text-body">{REPORT_TYPE_LABEL[r.report_type] ?? r.report_type}</span>
                    <MonoText className="text-[12px] text-foreground">{r.report_reference ?? "—"}</MonoText>
                    <span className="max-w-md truncate text-[12px] text-subtext">{r.report_summary}</span>
                    <span className="ml-auto font-mono text-[11px] text-hint">{r.issuing_regulator ?? "—"}</span>
                    <span className="font-mono text-[11px] text-hint">{d(r.filed_at_date)}</span>
                    <span className="font-mono text-[11px] uppercase" style={{ color: st.hex }}>{st.label}</span>
                    {r.status === "draft" && <Button size="sm" variant="outline" onClick={() => fileReport.mutate({ id: r.id }, { onSuccess: () => toast({ title: "Report filed" }) })}>File</Button>}
                  </div>
                );
              })}
              {(reports?.length ?? 0) === 0 && <p className="px-3 py-4 text-sm text-hint">No regulatory reports.</p>}
            </div></div>
          </TabsContent>

          {/* DS.AI Audit summary */}
          <TabsContent value="dsai">
            <div className="p-6">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatTile label="Decisions (mo)" value={dsai?.decisions_this_month ?? "—"} />
                <StatTile label="Oversight rate" value={dsai != null ? `${dsai.oversight_rate}%` : "—"} tone={(dsai?.oversight_rate ?? 100) < 50 ? "text-severity-high" : "text-severity-low"} />
                <StatTile label="Model versions" value={dsai?.model_versions ?? "—"} />
                <StatTile label="Data sources" value={dsai?.data_sources ?? "—"} />
              </div>
              <div className="mt-4 flex items-center gap-3 border border-primary/30 bg-primary/5 p-4">
                <Bot className="h-5 w-5 text-primary" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Every AI decision AVIR Mind makes is auditable.</p>
                  <p className="text-[12px] text-subtext">Decisions, human oversight, model &amp; prompt versions, data lineage, and a portable DS.AI conformance bundle.</p>
                </div>
                <Button asChild size="sm"><Link href="/compliance/dsai">Open audit trail <ArrowRight className="h-3.5 w-3.5" /></Link></Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
