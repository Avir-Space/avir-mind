"use client";

import { ArrowRight, Download, Loader2, Ruler, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { MonoText } from "@/components/avir/mono-text";
import { PageHeader } from "@/components/avir/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import {
  accuracyHex, CAL_WINDOWS, confidenceLevel, deltaTone, prettyCategory, sampleStatus, signalClassLabel,
} from "@/lib/design/calibration";
import { useCalibrationActions } from "@/lib/mutations/use-calibration-actions";
import { useCalibrationDashboard, useCalibrationTrends } from "@/lib/queries/use-calibration";
import { useAuth } from "@/lib/providers/auth-provider";
import { cn } from "@/lib/utils";

function StatTile({ label, value, sub, tone }: { label: string; value: string | number; sub?: React.ReactNode; tone?: string }) {
  return (
    <div className="border border-border bg-card px-5 py-4">
      <p className={cn("font-mono text-2xl leading-none", tone ?? "text-foreground")}>{value}</p>
      {sub && <p className="mt-1 text-[11px]">{sub}</p>}
      <p className="mt-1.5 font-mono text-eyebrow uppercase text-label">{label}</p>
    </div>
  );
}

function AccBar({ pct }: { pct: number | null }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-full max-w-[160px] overflow-hidden bg-surface"><div className="h-full" style={{ width: `${pct ?? 0}%`, background: accuracyHex(pct) }} /></div>
      <span className="font-mono text-[12px] tabular-nums" style={{ color: accuracyHex(pct) }}>{pct ?? "—"}%</span>
    </div>
  );
}

function TrendChart({ points }: { points: { snapshot_date: string; accuracy_pct: number | null; high_conf_accuracy_pct: number | null }[] }) {
  const [hover, setHover] = useState<{ x: number; y: number; date: string; acc: number } | null>(null);
  if (points.length < 2) return <p className="text-sm text-hint">Not enough history yet for a trend line.</p>;
  const W = 640, H = 180, pad = 28;
  const xs = (i: number) => pad + (i / (points.length - 1)) * (W - pad * 2);
  const ys = (v: number) => H - pad - (v / 100) * (H - pad * 2);
  const line = (key: "accuracy_pct" | "high_conf_accuracy_pct") =>
    points.map((p, i) => `${i === 0 ? "M" : "L"}${xs(i).toFixed(1)},${ys(p[key] ?? 0).toFixed(1)}`).join(" ");
  return (
    <div className="overflow-x-auto">
      <div className="relative min-w-[520px]">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Calibration trend">
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}><line x1={pad} y1={ys(g)} x2={W - pad} y2={ys(g)} stroke="currentColor" strokeOpacity={0.1} /><text x={4} y={ys(g) + 3} className="fill-hint" style={{ fontSize: 9 }}>{g}</text></g>
        ))}
        <path d={line("accuracy_pct")} fill="none" stroke="#1019EC" strokeWidth={2} />
        <path d={line("high_conf_accuracy_pct")} fill="none" stroke="#16A34A" strokeWidth={1.5} strokeDasharray="4 3" />
        {points.map((p, i) => (
          <circle key={i} cx={xs(i)} cy={ys(p.accuracy_pct ?? 0)} r={hover?.date === p.snapshot_date ? 4 : 2.5} fill="#1019EC"
            style={{ cursor: "pointer" }}
            onMouseEnter={() => setHover({ x: xs(i), y: ys(p.accuracy_pct ?? 0), date: p.snapshot_date, acc: p.accuracy_pct ?? 0 })}
            onMouseLeave={() => setHover(null)} />
        ))}
      </svg>
      {hover && (
        <div className="pointer-events-none absolute -translate-x-1/2 -translate-y-full whitespace-nowrap border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] text-foreground shadow"
          style={{ left: `${(hover.x / W) * 100}%`, top: `${(hover.y / H) * 100}%` }}>
          {new Date(hover.date).toLocaleDateString()} · {hover.acc}%
        </div>
      )}
      </div>
      <div className="flex gap-4 px-2 font-mono text-[10px] text-hint">
        <span className="inline-flex items-center gap-1"><span className="h-0.5 w-4 bg-primary" /> Overall</span>
        <span className="inline-flex items-center gap-1"><span className="h-0.5 w-4" style={{ background: "#16A34A" }} /> High confidence</span>
      </div>
    </div>
  );
}

export default function CalibrationPage() {
  const { orgRole } = useAuth();
  const isAdmin = orgRole === "owner" || orgRole === "admin";
  const [win, setWin] = useState(180);
  const { data: dash, isLoading } = useCalibrationDashboard(win);
  const { data: trends } = useCalibrationTrends();
  const { exportReport } = useCalibrationActions();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const stats = dash?.stats;
  const delta = dash?.delta_vs_prior;
  const dt = deltaTone(delta);

  async function doExport() {
    setBusy(true);
    try {
      const report = await exportReport(win);
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `calibration-report-${win}d.json`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      toast({ title: "Report exported" });
    } catch (e) { toast({ title: "Export failed", description: String((e as Error).message).slice(0, 90) }); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader eyebrow="Proof" title="Calibration" subtitle="Every prediction, measured. Every outcome, tracked."
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={doExport} disabled={busy}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Export</Button>
            {isAdmin && <Button asChild size="sm"><Link href="/calibration/publish"><ShieldCheck className="h-3.5 w-3.5" /> Scoreboards</Link></Button>}
          </div>
        } />

      <div className="flex-1 overflow-y-auto avir-scroll">
        {/* Window selector */}
        <div className="flex items-center gap-2 px-6 pt-4">
          <span className="font-mono text-eyebrow uppercase text-label">Window</span>
          <div className="inline-flex border border-border">
            {CAL_WINDOWS.map((w) => (
              <button key={w.value} type="button" onClick={() => setWin(w.value)}
                className={cn("border-r border-border px-2.5 py-1 text-xs transition-colors last:border-r-0", win === w.value ? "bg-primary text-primary-foreground" : "text-subtext hover:text-foreground")}>{w.label}</button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 px-6 pt-4 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[84px]" />)}</div>
        ) : !dash?.has_data ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Ruler className="h-8 w-8 text-label" strokeWidth={1.5} />
            <p className="mt-3 text-sm text-subtext">No calibration snapshots yet for this window.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 px-6 pt-4 lg:grid-cols-4">
              <StatTile label={`Overall accuracy (${win}d)`} value={`${stats?.overall_accuracy_pct ?? "—"}%`} tone="text-foreground"
                sub={delta != null ? <span style={{ color: dt.hex }}>{dt.glyph} {Math.abs(delta)}pt vs prior</span> : undefined} />
              <StatTile label="Predictions measured" value={(stats?.total_measured ?? 0).toLocaleString()} sub={<span className="text-hint">of {(stats?.total_signals ?? 0).toLocaleString()} signals</span>} />
              <StatTile label="Signal action rate" value={`${stats?.action_rate_pct ?? "—"}%`} />
              <StatTile label="Data coverage" value={`${stats?.coverage_pct ?? "—"}%`} sub={<span className="text-hint">signals with measured outcomes</span>} />
            </div>

            <Tabs defaultValue="overview" className="mt-5">
              <div className="border-b border-border px-6"><TabsList className="w-full justify-start">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="category">By Category</TabsTrigger>
                <TabsTrigger value="confidence">By Confidence</TabsTrigger>
                <TabsTrigger value="model">By Model</TabsTrigger>
                <TabsTrigger value="actions">Actions</TabsTrigger>
                <TabsTrigger value="trends">Trends</TabsTrigger>
                {isAdmin && <TabsTrigger value="publications">Publications</TabsTrigger>}
              </TabsList></div>

              {/* Overview */}
              <TabsContent value="overview">
                <div className="flex items-center justify-between px-6 py-3">
                  <p className="eyebrow">By signal class</p>
                  <Link href="/calibration/overview" className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-primary hover:underline">Category × confidence grid <ArrowRight className="h-3 w-3" /></Link>
                </div>
                <div className="grid gap-2 px-6 sm:grid-cols-3">
                  {(dash.by_class ?? []).map((c) => (
                    <div key={c.signal_class} className="border border-border bg-card p-3">
                      <p className="text-[13px] font-medium text-foreground">{signalClassLabel(c.signal_class)}</p>
                      <div className="mt-2"><AccBar pct={c.accuracy_pct} /></div>
                      <p className="mt-1 font-mono text-[10px] text-hint">{c.measured} measured · {c.coverage_pct ?? "—"}% coverage</p>
                    </div>
                  ))}
                </div>
                <p className="eyebrow px-6 pb-2 pt-5">By category</p>
                <div className="px-6 pb-6">
                  <div className="border border-border">
                    {(dash.by_category ?? []).map((c) => {
                      const ss = sampleStatus(c.sample_size_status);
                      return (
                        <Link key={c.signal_category} href={`/calibration/category/${encodeURIComponent(c.signal_category)}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 px-3 py-2.5 last:border-b-0 hover:bg-surface/40">
                          <span className="w-52 text-[13px] text-foreground">{prettyCategory(c.signal_category)}</span>
                          <AccBar pct={c.accuracy_pct} />
                          <span className="ml-auto font-mono text-[11px] text-hint">n={c.total_signals}</span>
                          <span className="font-mono text-[10px] uppercase" style={{ color: ss.hex }}>{ss.label}</span>
                        </Link>
                      );
                    })}
                    {(dash.by_category?.length ?? 0) === 0 && <p className="px-3 py-4 text-sm text-hint">No categories.</p>}
                  </div>
                </div>
              </TabsContent>

              {/* By Category (table) */}
              <TabsContent value="category">
                <div className="p-6"><div className="border border-border">
                  <div className="flex items-center gap-x-4 border-b border-border bg-surface/40 px-3 py-1.5 font-mono text-eyebrow uppercase text-label">
                    <span className="w-52">Category</span><span className="flex-1">Accuracy</span><span className="w-28">Correct/Part/Inc</span><span className="w-16">n</span><span className="w-24">Sample</span>
                  </div>
                  {(dash.by_category ?? []).map((c) => {
                    const ss = sampleStatus(c.sample_size_status);
                    return (
                      <Link key={c.signal_category} href={`/calibration/category/${encodeURIComponent(c.signal_category)}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 px-3 py-2 last:border-b-0 hover:bg-surface/40">
                        <span className="w-52 text-[13px] text-primary">{prettyCategory(c.signal_category)}</span>
                        <span className="flex-1"><AccBar pct={c.accuracy_pct} /></span>
                        <span className="w-28 font-mono text-[11px]"><span className="text-severity-low">{c.correct}</span>/<span className="text-severity-medium">{c.partial}</span>/<span className="text-severity-high">{c.incorrect}</span></span>
                        <span className="w-16 font-mono text-[11px] text-hint">{c.total_signals}</span>
                        <span className="w-24 font-mono text-[10px] uppercase" style={{ color: ss.hex }}>{ss.label}</span>
                      </Link>
                    );
                  })}
                </div></div>
              </TabsContent>

              {/* By Confidence */}
              <TabsContent value="confidence">
                <div className="p-6 space-y-3">
                  {(dash.by_confidence ?? []).map((c) => {
                    const cl = confidenceLevel(c.confidence_level);
                    return (
                      <div key={c.confidence_level} className="border border-border bg-card p-4">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-sm uppercase" style={{ color: cl.hex }}>{cl.label} confidence</span>
                          <span className="font-mono text-[11px] text-hint">{c.measured} measured of {c.total_signals}</span>
                        </div>
                        <div className="mt-2"><AccBar pct={c.accuracy_pct} /></div>
                      </div>
                    );
                  })}
                  <p className="text-[12px] text-hint">Well-calibrated AI shows higher accuracy at higher stated confidence. Where high confidence is <em>less</em> accurate than it claims, that is overconfidence — surfaced honestly, not hidden.</p>
                </div>
              </TabsContent>

              {/* By Model */}
              <TabsContent value="model">
                <div className="p-6 space-y-2">
                  {(dash.by_model ?? []).map((m) => (
                    <div key={m.model_identifier} className="flex flex-wrap items-center gap-x-4 gap-y-1 border border-border bg-card px-3 py-2.5">
                      <MonoText className="w-56 truncate text-[12px] text-foreground">{m.model_identifier}</MonoText>
                      <span className="flex-1"><AccBar pct={m.accuracy_pct} /></span>
                      <span className="ml-auto font-mono text-[11px] text-hint">{m.measured} measured / {m.total_signals}</span>
                    </div>
                  ))}
                </div>
              </TabsContent>

              {/* Actions */}
              <TabsContent value="actions">
                <div className="grid grid-cols-2 gap-3 p-6 lg:grid-cols-3">
                  <StatTile label="Acted on (create task)" value={`${stats?.action_rate_pct ?? "—"}%`} tone="text-severity-low" />
                  <StatTile label="Dismissed" value={`${stats?.dismissal_rate_pct ?? "—"}%`} tone="text-hint" />
                  <StatTile label="Coverage (measured)" value={`${stats?.coverage_pct ?? "—"}%`} />
                </div>
                <p className="px-6 pb-6 text-[12px] text-hint">Action and dismissal rates are the human engagement signal behind calibration — a dismissed signal that would have been correct is as informative as a missed one.</p>
              </TabsContent>

              {/* Trends */}
              <TabsContent value="trends">
                <div className="p-6">
                  <p className="eyebrow mb-2">Rolling 30-day accuracy over time</p>
                  <TrendChart points={trends ?? []} />
                </div>
              </TabsContent>

              {/* Publications (admin) */}
              {isAdmin && (
                <TabsContent value="publications">
                  <div className="flex items-center justify-between p-6">
                    <p className="text-sm text-subtext">Published scoreboards and their content hashes.</p>
                    <div className="flex gap-2">
                      <Button asChild size="sm" variant="outline"><Link href="/calibration/publications">View publications</Link></Button>
                      <Button asChild size="sm"><Link href="/calibration/publish">Compose scoreboard</Link></Button>
                    </div>
                  </div>
                </TabsContent>
              )}
            </Tabs>
          </>
        )}
      </div>
    </div>
  );
}
