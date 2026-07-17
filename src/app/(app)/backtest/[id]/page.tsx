"use client";

import { ChevronLeft, FileText, Loader2, Play, Upload } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useRef, useState } from "react";

import { MonoText } from "@/components/avir/mono-text";
import { PageHeader } from "@/components/avir/page-header";
import { BacktestReportView } from "@/components/backtest/report-view";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import {
  backtestStatus, caughtRateHex, matchConfidence, prettyCategory, SOURCE_TYPE_LABEL,
} from "@/lib/design/backtest";
import { useBacktestActions } from "@/lib/mutations/use-backtest-actions";
import {
  useActualEvents, useBacktestProject, useBacktestReports, useBacktestSummary, useSimulatedSignals,
} from "@/lib/queries/use-backtest";
import type { BacktestReport } from "@/types/backtest";

const dt = (x: string | null) => (x ? new Date(x).toLocaleString() : "—");
const dd = (x: string) => new Date(x).toLocaleDateString();

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return <div className="border border-border bg-card px-5 py-4"><p className={`font-mono text-2xl leading-none ${tone ?? "text-foreground"}`}>{value}</p><p className="mt-1.5 font-mono text-eyebrow uppercase text-label">{label}</p></div>;
}

export default function BacktestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: detail, isLoading } = useBacktestProject(id);
  const { toast } = useToast();
  const { ingest, execute, generateReport } = useBacktestActions();

  const status = detail?.project.status;
  const isComplete = status === "complete";
  const { data: summary } = useBacktestSummary(id, isComplete);
  const [sigFilter, setSigFilter] = useState<{ match?: string; category?: string }>({});
  const { data: signals } = useSimulatedSignals(id, sigFilter);
  const { data: events } = useActualEvents(id);
  const { data: reports } = useBacktestReports(id);

  const [sourceType, setSourceType] = useState("csv_component_events");
  const [uploading, setUploading] = useState(false);
  const [running, setRunning] = useState(false);
  const [viewReport, setViewReport] = useState<BacktestReport | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(f: File) {
    setUploading(true);
    try {
      const content = await f.text();
      const r = await ingest({ projectId: id, sourceType, fileName: f.name, content });
      if (r.error) throw new Error(r.error);
      toast({ title: "Ingested", description: `${r.states_ingested ?? 0} states · ${r.actual_events_ingested ?? 0} events · ${r.error_count ?? 0} errors` });
    } catch (e) { toast({ title: "Ingestion failed", description: String((e as Error).message).slice(0, 100) }); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function run() {
    setRunning(true);
    try {
      const r = await execute(id);
      if (r.error) throw new Error(r.error);
      toast({ title: "Backtest complete", description: "Results are ready." });
    } catch (e) { toast({ title: "Run failed", description: String((e as Error).message).slice(0, 100) }); }
    finally { setRunning(false); }
  }

  if (isLoading || !detail) return <div className="p-6"><Skeleton className="h-9 w-64" /><div className="mt-4 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div></div>;

  const p = detail.project; const st = backtestStatus(p.status); const ready = detail.readiness?.ready;

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-4"><Link href="/backtest" className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-label hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /> Backtest</Link></div>
      <PageHeader eyebrow={p.customer_organization_name ?? "Simulation"} title={p.project_name}
        subtitle={`${dd(p.data_period_start ?? p.created_at_utc)} → ${p.data_period_end ? dd(p.data_period_end) : "—"}`}
        actions={<span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: st.hex }} /><span className="text-[13px]" style={{ color: st.hex }}>{st.label}</span></span>} />

      <div className="flex-1 overflow-y-auto avir-scroll">
        <Tabs defaultValue={isComplete ? "results" : "sources"}>
          <div className="border-b border-border px-6"><TabsList className="w-full justify-start">
            <TabsTrigger value="sources">Data Sources</TabsTrigger>
            <TabsTrigger value="config">Configuration</TabsTrigger>
            <TabsTrigger value="run">Run</TabsTrigger>
            <TabsTrigger value="results">Results</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
          </TabsList></div>

          {/* Data Sources */}
          <TabsContent value="sources">
            <div className="p-6">
              <div className="mb-4 flex flex-wrap items-end gap-2 border border-dashed border-border bg-surface/30 p-4">
                <div><p className="eyebrow mb-1">Source type</p>
                  <Select value={sourceType} onValueChange={setSourceType}>
                    <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(SOURCE_TYPE_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <input ref={fileRef} type="file" accept=".csv,.json,text/csv,application/json" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
                <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Upload file</Button>
                <span className="font-mono text-[11px] text-hint">CSV or JSON · extra columns ignored · dates normalized to UTC</span>
              </div>

              <div className="border border-border">
                <div className="flex items-center gap-x-4 border-b border-border bg-surface/40 px-3 py-1.5 font-mono text-eyebrow uppercase text-label">
                  <span className="flex-1">File</span><span className="w-48">Type</span><span className="w-20">Rows</span><span className="w-20">Errors</span><span className="w-36">Ingested</span>
                </div>
                {(detail.data_sources ?? []).map((s) => {
                  const errCount = Array.isArray(s.ingestion_errors) ? s.ingestion_errors.length : 0;
                  return (
                    <div key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 px-3 py-2 last:border-b-0">
                      <MonoText className="flex-1 truncate text-[12px] text-foreground">{s.source_file_name}</MonoText>
                      <span className="w-48 text-[11px] text-subtext">{SOURCE_TYPE_LABEL[s.source_type] ?? s.source_type}</span>
                      <span className="w-20 font-mono text-[12px] text-foreground">{s.rows_ingested ?? "—"}</span>
                      <span className="w-20 font-mono text-[12px]" style={{ color: errCount ? "#DC2626" : "#16A34A" }}>{errCount}</span>
                      <span className="w-36 font-mono text-[11px] text-hint">{dt(s.ingested_at_utc)}</span>
                    </div>
                  );
                })}
                {(detail.data_sources?.length ?? 0) === 0 && <p className="px-3 py-4 text-sm text-hint">No sources ingested yet.</p>}
              </div>

              <div className="mt-4 flex items-center gap-2 border p-3" style={{ borderColor: ready ? "#16A34A55" : "#CA8A0455" }}>
                <span className="font-mono text-[11px] uppercase" style={{ color: ready ? "#16A34A" : "#CA8A04" }}>{ready ? "Ready to run" : "Not ready"}</span>
                <span className="font-mono text-[11px] text-hint">{detail.readiness?.reconstructed_states ?? 0} states · {detail.readiness?.actual_events ?? 0} actual events</span>
                {(detail.readiness?.warnings ?? []).map((w, i) => <span key={i} className="font-mono text-[10px] text-severity-medium">· {w}</span>)}
              </div>
            </div>
          </TabsContent>

          {/* Configuration */}
          <TabsContent value="config">
            <div className="max-w-xl space-y-4 p-6">
              <div className="border border-border bg-card p-4">
                <p className="eyebrow mb-2">Signal categories</p>
                <p className="text-[13px] text-subtext">All categories the deterministic rule engine supports are included: engine_borescope, component_wear, delay_pattern, incident_risk. (Category filtering is applied on the Results tab.)</p>
              </div>
              <div className="border border-border bg-card p-4">
                <p className="eyebrow mb-2">Match criteria</p>
                <p className="text-[13px] text-subtext">A simulated signal matches an actual event when it fired on the same asset, before the event, within a 90-day forward window. Confidence is graded exact / likely / uncertain by category alignment and lead time.</p>
              </div>
              <div className="border border-border bg-card p-4">
                <p className="eyebrow mb-2">Estimated cost</p>
                <p className="font-mono text-lg text-foreground">&lt; $50</p>
                <p className="text-[12px] text-hint">The replay is deterministic (~$0); the figure recorded on a run is the modeled Opus-equivalent projection. A 90-day / 20-aircraft backtest stays well under budget.</p>
              </div>
            </div>
          </TabsContent>

          {/* Run */}
          <TabsContent value="run">
            <div className="p-6">
              <Button onClick={run} disabled={!ready || running || status === "running"}>{running || status === "running" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Execute backtest</Button>
              {!ready && <p className="mt-2 text-[12px] text-hint">Ingest reconstructed states and actual events before running.</p>}

              <p className="eyebrow mb-2 mt-6">Recent runs</p>
              <div className="border border-border">
                {(detail.runs ?? []).map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 px-3 py-2 last:border-b-0">
                    <span className="font-mono text-[11px] uppercase" style={{ color: backtestStatus(r.status).hex }}>{r.status}</span>
                    <span className="font-mono text-[11px] text-hint">{r.run_type}</span>
                    <span className="text-[12px] text-foreground">{r.signals_generated_count} signals · {r.actual_events_matched_count} matched</span>
                    <span className="ml-auto font-mono text-[11px] text-hint">{dt(r.started_at_utc)}</span>
                    {r.total_cost_usd != null && <span className="font-mono text-[11px] text-primary">${Number(r.total_cost_usd).toFixed(2)}</span>}
                  </div>
                ))}
                {(detail.runs?.length ?? 0) === 0 && <p className="px-3 py-4 text-sm text-hint">No runs yet.</p>}
              </div>
            </div>
          </TabsContent>

          {/* Results */}
          <TabsContent value="results">
            {!isComplete ? <p className="p-6 text-sm text-hint">Run the backtest to see results.</p> : (
              <div className="p-6">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Stat label="Simulated signals" value={summary?.total_simulated_signals ?? "—"} />
                  <Stat label="Matched events" value={`${summary?.matched_events ?? 0} / ${summary?.total_actual_events ?? 0}`} />
                  <Stat label="Would-have-caught" value={summary != null ? `${summary.would_have_caught_pct}%` : "—"} tone="" />
                  <Stat label="Avg lead time" value={summary != null ? `${summary.avg_lead_time_days}d` : "—"} />
                </div>
                {summary && (
                  <div className="mt-3 h-2 w-full overflow-hidden bg-surface"><div className="h-full" style={{ width: `${summary.would_have_caught_pct}%`, background: caughtRateHex(summary.would_have_caught_pct) }} /></div>
                )}

                {/* by category */}
                <p className="eyebrow mb-2 mt-6">By category</p>
                <div className="flex flex-wrap gap-2">
                  {(summary?.by_category ?? []).map((c) => (
                    <Link key={c.category} href={`/backtest/${id}/results/${encodeURIComponent(c.category)}`} className="inline-flex items-center gap-2 border border-border bg-card px-3 py-1.5 text-xs transition-colors hover:border-border-strong">
                      <span className="text-foreground">{prettyCategory(c.category)}</span>
                      <span className="font-mono text-hint">{c.matched}/{c.signals} matched</span>
                    </Link>
                  ))}
                </div>

                {/* timeline: simulated signals vs actual events */}
                <p className="eyebrow mb-2 mt-6">Timeline — simulated signals (blue) vs actual events (amber)</p>
                <BacktestTimeline signals={(signals ?? []).map((s) => ({ t: s.would_have_fired_at_utc, matched: Boolean(s.matched_actual_event_id) }))}
                  events={(events ?? []).map((e) => ({ t: e.actual_event_time_utc, caught: e.caught }))} />

                {/* signal list */}
                <div className="mt-6 flex items-center gap-2">
                  <p className="eyebrow">Simulated signals</p>
                  <select value={sigFilter.match ?? ""} onChange={(e) => setSigFilter((f) => ({ ...f, match: e.target.value || undefined }))} className="h-7 border border-input bg-transparent px-2 text-xs text-foreground focus:border-primary focus:outline-none">
                    <option value="">All matches</option><option value="exact">Exact</option><option value="likely">Likely</option><option value="uncertain">Uncertain</option><option value="no_match">No match</option>
                  </select>
                </div>
                <div className="mt-2 border border-border">
                  {(signals ?? []).slice(0, 100).map((s) => {
                    const mc = matchConfidence(s.match_confidence);
                    return (
                      <div key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 px-3 py-2 last:border-b-0">
                        <span className="w-40 truncate text-[12px] text-foreground">{prettyCategory(s.simulated_signal_category)}</span>
                        <MonoText muted className="w-28 truncate text-[11px]">{s.entity_external_id}</MonoText>
                        <span className="flex-1 truncate text-[12px] text-subtext">{s.title}</span>
                        <span className="font-mono text-[11px] text-hint">{dd(s.would_have_fired_at_utc)}</span>
                        {s.match_lead_time_days != null && s.matched_actual_event_id && <span className="font-mono text-[11px] text-primary">{s.match_lead_time_days}d lead</span>}
                        <span className="font-mono text-[10px] uppercase" style={{ color: mc.hex }}>{mc.label}</span>
                      </div>
                    );
                  })}
                  {(signals?.length ?? 0) === 0 && <p className="px-3 py-4 text-sm text-hint">No signals.</p>}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Reports */}
          <TabsContent value="reports">
            <div className="p-6">
              <Button size="sm" disabled={!isComplete || generateReport.isPending} onClick={() => generateReport.mutate({ projectId: id }, { onSuccess: () => toast({ title: "Report generated" }) })}>
                {generateReport.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} Generate executive summary
              </Button>
              {!isComplete && <p className="mt-2 text-[12px] text-hint">Complete a run first.</p>}

              <div className="mt-4 border border-border">
                {(reports ?? []).map((r) => (
                  <button key={r.id} type="button" onClick={() => setViewReport(r)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 px-3 py-2.5 text-left last:border-b-0 hover:bg-surface/40">
                    <FileText className="h-3.5 w-3.5 text-label" />
                    <span className="text-[13px] text-primary">{r.report_type.replace(/_/g, " ")}</span>
                    <span className="flex-1 truncate text-[12px] text-subtext">{r.narrative?.headline}</span>
                    <span className="font-mono text-[11px] text-hint">{dt(r.generated_at_utc)}</span>
                  </button>
                ))}
                {(reports?.length ?? 0) === 0 && <p className="px-3 py-4 text-sm text-hint">No reports generated yet.</p>}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={Boolean(viewReport)} onOpenChange={(o) => !o && setViewReport(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto avir-scroll p-0">
          {viewReport && <BacktestReportView report={viewReport} project={p} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BacktestTimeline({ signals, events }: { signals: { t: string; matched: boolean }[]; events: { t: string; caught: boolean }[] }) {
  const all = [...signals.map((s) => +new Date(s.t)), ...events.map((e) => +new Date(e.t))];
  if (all.length === 0) return <p className="text-sm text-hint">No events to plot.</p>;
  const min = Math.min(...all), max = Math.max(...all), span = Math.max(1, max - min);
  const x = (t: string) => ((+new Date(t) - min) / span) * 100;
  return (
    <div className="border border-border bg-card p-4">
      <div className="relative h-8">
        <div className="absolute inset-x-0 top-4 h-px bg-border" />
        {signals.map((s, i) => <div key={`s${i}`} className="absolute top-1.5 h-2.5 w-2.5 -translate-x-1/2 rounded-full" style={{ left: `${x(s.t)}%`, background: s.matched ? "#1019EC" : "#94A3B8" }} title="simulated signal" />)}
      </div>
      <div className="relative h-8">
        {events.map((e, i) => <div key={`e${i}`} className="absolute top-1.5 h-2.5 w-2.5 -translate-x-1/2 rotate-45" style={{ left: `${x(e.t)}%`, background: e.caught ? "#CA8A04" : "#DC2626" }} title={e.caught ? "actual event (caught)" : "actual event (missed)"} />)}
      </div>
      <div className="mt-1 flex gap-4 font-mono text-[10px] text-hint">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" /> matched signal</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#94A3B8]" /> unmatched signal</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rotate-45 bg-[#CA8A04]" /> caught event</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rotate-45 bg-[#DC2626]" /> missed event</span>
      </div>
    </div>
  );
}
