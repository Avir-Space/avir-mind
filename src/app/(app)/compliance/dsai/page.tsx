"use client";

import { ChevronLeft, Download, Loader2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { MonoText } from "@/components/avir/mono-text";
import { PageHeader } from "@/components/avir/page-header";
import { DecisionAuditDrawer } from "@/components/compliance/decision-audit-drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { confidence, decisionTypeLabel, oversightType } from "@/lib/design/compliance";
import { useComplianceActions } from "@/lib/mutations/use-compliance-actions";
import {
  useDataLineage, useDsaiDashboard, useDsaiDecisions, useDsaiOversight, useModelVersionReport,
} from "@/lib/queries/use-compliance";

const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");
const dd = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : "current");

function StatTile({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="border border-border bg-card px-5 py-4">
      <p className={`font-mono text-2xl leading-none ${tone ?? "text-foreground"}`}>{value}</p>
      <p className="mt-1.5 font-mono text-eyebrow uppercase text-label">{label}</p>
    </div>
  );
}

export default function DsaiAuditPage() {
  const { data: stats } = useDsaiDashboard();
  const { data: decisions, isLoading: decLoading } = useDsaiDecisions();
  const { data: oversight } = useDsaiOversight();
  const { data: report } = useModelVersionReport();
  const { exportBundle } = useComplianceActions();
  const { toast } = useToast();

  const [auditSignal, setAuditSignal] = useState<string | null>(null);
  const [lineageId, setLineageId] = useState<string | null>(null);
  const { data: lineage } = useDataLineage(lineageId);

  const monthAgo = useMemo(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10), []);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Record<string, number> | null>(null);

  async function doExport() {
    setBusy(true);
    try {
      const bundle = await exportBundle(new Date(from).toISOString(), new Date(to + "T23:59:59").toISOString());
      const counts: Record<string, number> = {};
      for (const k of ["ai_decisions", "human_oversight", "model_versions", "prompt_versions", "data_lineage"]) {
        const arr = (bundle as Record<string, unknown>)[k];
        counts[k] = Array.isArray(arr) ? arr.length : 0;
      }
      setPreview(counts);
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `dsai-conformance-bundle-${from}_${to}.json`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      toast({ title: "Bundle exported", description: `${counts.ai_decisions} decisions · downloaded JSON.` });
    } catch (e) {
      toast({ title: "Export failed", description: String((e as Error).message).slice(0, 100) });
    } finally { setBusy(false); }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-4"><Link href="/compliance" className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-label hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /> Compliance</Link></div>
      <PageHeader eyebrow="DS.AI Conformance" title="DS.AI Audit Trail" subtitle="Every AI decision AVIR Mind has made, with full provenance." />

      <div className="flex-1 overflow-y-auto avir-scroll">
        <div className="grid grid-cols-2 gap-3 px-6 pt-5 lg:grid-cols-4">
          <StatTile label="Decisions this month" value={stats?.decisions_this_month ?? "—"} />
          <StatTile label="Human oversight rate" value={stats != null ? `${stats.oversight_rate}%` : "—"} tone={(stats?.oversight_rate ?? 100) < 50 ? "text-severity-high" : "text-severity-low"} />
          <StatTile label="Model versions" value={stats?.model_versions ?? "—"} />
          <StatTile label="Data sources referenced" value={stats?.data_sources ?? "—"} />
        </div>

        <Tabs defaultValue="decisions" className="mt-5">
          <div className="border-b border-border px-6"><TabsList className="w-full justify-start">
            <TabsTrigger value="decisions">Decisions</TabsTrigger>
            <TabsTrigger value="oversight">Oversight</TabsTrigger>
            <TabsTrigger value="models">Models</TabsTrigger>
            <TabsTrigger value="prompts">Prompts</TabsTrigger>
            <TabsTrigger value="lineage">Data Lineage</TabsTrigger>
            <TabsTrigger value="export">Export</TabsTrigger>
          </TabsList></div>

          {/* Decisions */}
          <TabsContent value="decisions">
            <div className="p-6">
              {decLoading ? <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div> : (
                <div className="border border-border">
                  <div className="flex items-center gap-x-4 border-b border-border bg-surface/40 px-3 py-1.5 font-mono text-eyebrow uppercase text-label">
                    <span className="w-40">Type</span><span className="w-52">Model</span><span className="w-24">Confidence</span><span className="flex-1">When</span><span className="w-20">Review</span><span />
                  </div>
                  {(decisions ?? []).map((r) => {
                    const cf = confidence(r.output_confidence);
                    return (
                      <div key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/50 px-3 py-2 last:border-b-0">
                        <span className="w-40 text-[12px] text-foreground">{decisionTypeLabel(r.decision_type)}</span>
                        <MonoText muted className="w-52 truncate text-[11px]">{r.model_identifier}</MonoText>
                        <span className="w-24 font-mono text-[11px]" style={{ color: cf.hex }}>{cf.label}</span>
                        <span className="flex-1 font-mono text-[11px] text-hint">{dt(r.decision_at_utc)}</span>
                        <span className="w-20 font-mono text-[11px]" style={{ color: r.reviewed ? "#16A34A" : "#EA580C" }}>{r.reviewed ? "reviewed" : "pending"}</span>
                        {r.linked_signal_id ? <Button size="sm" variant="ghost" onClick={() => setAuditSignal(r.linked_signal_id)}>Audit</Button> : <span className="font-mono text-[10px] text-hint">—</span>}
                      </div>
                    );
                  })}
                  {(decisions?.length ?? 0) === 0 && <p className="px-3 py-6 text-center text-sm text-hint">No AI decisions recorded.</p>}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Oversight */}
          <TabsContent value="oversight">
            <div className="p-6"><div className="border border-border">
              {(oversight ?? []).map((o) => {
                const ot = oversightType(o.oversight_type);
                return (
                  <div key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/50 px-3 py-2 last:border-b-0">
                    <span className="w-28 font-mono text-[11px] uppercase" style={{ color: ot.hex }}>{ot.label}</span>
                    <span className="text-[12px] text-foreground">{decisionTypeLabel(o.decision_type)}</span>
                    <span className="max-w-sm truncate text-[12px] text-subtext">{o.signal_title ?? "—"}</span>
                    <span className="ml-auto font-mono text-[11px] text-hint">{o.reviewer_role ?? "—"}</span>
                    {o.outcome_matched_ai != null && <span className="font-mono text-[11px]" style={{ color: o.outcome_matched_ai ? "#16A34A" : "#DC2626" }}>{o.outcome_matched_ai ? "matched AI" : "differed"}</span>}
                    <span className="font-mono text-[11px] text-hint">{dt(o.created_at_utc)}</span>
                  </div>
                );
              })}
              {(oversight?.length ?? 0) === 0 && <p className="px-3 py-6 text-center text-sm text-hint">No oversight events yet.</p>}
            </div></div>
          </TabsContent>

          {/* Models */}
          <TabsContent value="models">
            <div className="p-6 space-y-2">
              {(report?.models ?? []).map((m) => (
                <div key={m.id} className="border border-border bg-card p-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <MonoText className="text-[13px] text-foreground">{m.model_identifier}</MonoText>
                    <span className="border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase text-body">{m.provider}</span>
                    {m.deployed_to_utc == null && <span className="font-mono text-[10px] uppercase text-severity-low">active</span>}
                    <span className="ml-auto font-mono text-[11px] text-hint">{dd(m.deployed_from_utc)} → {dd(m.deployed_to_utc)}</span>
                    <span className="font-mono text-[11px] text-primary">{m.decision_count} decisions</span>
                  </div>
                  {m.deployment_notes && <p className="mt-1 text-[12px] text-subtext">{m.deployment_notes}</p>}
                  {(m.known_limitations?.length ?? 0) > 0 && <p className="mt-1 font-mono text-[10px] text-hint">Limitations: {m.known_limitations!.join(" · ")}</p>}
                </div>
              ))}
              {(report?.models.length ?? 0) === 0 && <p className="py-6 text-center text-sm text-hint">No model versions registered.</p>}
            </div>
          </TabsContent>

          {/* Prompts */}
          <TabsContent value="prompts">
            <div className="p-6 space-y-2">
              {(report?.prompts ?? []).map((p) => (
                <div key={p.prompt_template_hash} className="border border-border bg-card p-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-mono text-[11px] text-primary">v{p.version_number}</span>
                    <MonoText muted className="text-[11px]">{p.prompt_template_identifier}</MonoText>
                    <span className="ml-auto font-mono text-[10px] text-hint">{dd(p.deployed_from_utc)} → {dd(p.deployed_to_utc)}</span>
                  </div>
                  {p.change_summary && <p className="mt-1 text-[12px] text-foreground">{p.change_summary}</p>}
                  <p className="mt-1 font-mono text-[10px] leading-snug text-hint">{p.prompt_preview}</p>
                </div>
              ))}
              {(report?.prompts.length ?? 0) === 0 && <p className="py-6 text-center text-sm text-hint">No prompt versions registered.</p>}
            </div>
          </TabsContent>

          {/* Lineage */}
          <TabsContent value="lineage">
            <div className="flex min-h-0">
              <div className="w-80 shrink-0 overflow-y-auto avir-scroll border-r border-border" style={{ maxHeight: "60vh" }}>
                {(decisions ?? []).filter((r) => r.lineage_count > 0).map((r) => (
                  <button key={r.id} type="button" onClick={() => setLineageId(r.id)}
                    className={`block w-full border-b border-border/60 px-4 py-2.5 text-left transition-colors hover:bg-surface/40 ${lineageId === r.id ? "bg-surface/60" : ""}`}>
                    <p className="text-[12px] text-foreground">{decisionTypeLabel(r.decision_type)}</p>
                    <p className="font-mono text-[10px] text-hint">{r.model_identifier} · {r.lineage_count} source(s)</p>
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto avir-scroll p-6">
                {!lineageId ? <p className="text-sm text-hint">Select a decision to trace the exact data used to generate it.</p> : !lineage ? <Skeleton className="h-24 w-full" /> : (
                  <div className="space-y-2">
                    <p className="eyebrow">{lineage.sources.length} data source(s)</p>
                    {lineage.sources.map((sc) => (
                      <div key={sc.id} className="border border-border bg-card p-3">
                        <p className="font-mono text-[12px] text-foreground">{sc.source_table} · {String(sc.source_row_id).slice(0, 8)}…</p>
                        <p className="font-mono text-[10px] text-hint">generated by {sc.source_data_generated_by ?? "—"}</p>
                        {sc.source_data_snapshot && <pre className="mt-1.5 overflow-x-auto border border-border/60 bg-surface/40 p-2 font-mono text-[10px] text-subtext">{JSON.stringify(sc.source_data_snapshot, null, 2)}</pre>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Export */}
          <TabsContent value="export">
            <div className="max-w-2xl p-6">
              <div className="flex items-start gap-3 border border-primary/30 bg-primary/5 p-4">
                <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
                <p className="text-[13px] text-subtext">Generate a portable DS.AI conformance bundle for a time window — all AI decisions, human oversight events, model &amp; prompt versions, and data lineage as a single JSON, aligned to EASA NPA 2025-07.</p>
              </div>
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <div><p className="eyebrow mb-1">From</p><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /></div>
                <div><p className="eyebrow mb-1">To</p><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" /></div>
                <Button onClick={doExport} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Generate &amp; download</Button>
              </div>
              {preview && (
                <div className="mt-4 border border-border bg-card p-4">
                  <p className="eyebrow mb-2">Last bundle contents</p>
                  <div className="grid grid-cols-2 gap-2 font-mono text-[12px] sm:grid-cols-5">
                    {Object.entries(preview).map(([k, v]) => (
                      <div key={k}><p className="text-foreground text-lg">{v}</p><p className="text-hint">{k.replace(/_/g, " ")}</p></div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <DecisionAuditDrawer signalId={auditSignal} open={Boolean(auditSignal)} onOpenChange={(o) => !o && setAuditSignal(null)} />
    </div>
  );
}
