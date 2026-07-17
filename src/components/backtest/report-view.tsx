"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { caughtRateHex, prettyCategory, prettyEventType } from "@/lib/design/backtest";
import type { BacktestProject, BacktestReport } from "@/types/backtest";

const dd = (x: string | null) => (x ? new Date(x).toLocaleDateString() : "—");

/**
 * Presentation-grade executive summary. Rendered on screen and printed to PDF via
 * the browser (the locked Phase 4 decision: client-side print of styled HTML).
 */
export function BacktestReportView({ report, project }: { report: BacktestReport; project: BacktestProject }) {
  const s = report.summary_stats; const n = report.narrative;
  const rate = s?.would_have_caught_pct ?? 0;

  return (
    <div>
      {/* Toolbar (screen only) */}
      <div className="flex items-center justify-between border-b border-border bg-surface/40 px-5 py-3 print:hidden">
        <span className="font-mono text-eyebrow uppercase text-label">Executive summary</span>
        <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="h-3.5 w-3.5" /> Print / Save PDF</Button>
      </div>

      <div id="backtest-report" className="bg-white px-10 py-10 text-[#1a1a22]">
        {/* Cover */}
        <div className="border-b-4 border-[#1019EC] pb-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#1019EC]">AVIR Mind · Shadow-Mode Backtest</p>
          <h1 className="mt-3 font-serif text-4xl leading-tight text-[#0a0a0f]">{project.project_name}</h1>
          <p className="mt-1 text-lg text-[#4a4a55]">{project.customer_organization_name ?? "Operational replay"}</p>
          <p className="mt-1 font-mono text-[12px] text-[#6b6b76]">Data period {dd(project.data_period_start)} — {dd(project.data_period_end)} · generated {new Date(report.generated_at_utc).toLocaleDateString()}</p>
        </div>

        {/* Headline stat */}
        <div className="mt-8 flex items-end gap-8">
          <div>
            <p className="font-mono text-7xl leading-none" style={{ color: caughtRateHex(rate) }}>{rate}<span className="text-2xl">%</span></p>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-[#6b6b76]">of significant events would have been caught</p>
          </div>
          <div className="grid grid-cols-3 gap-6 pb-1">
            <div><p className="font-mono text-2xl text-[#0a0a0f]">{s?.avg_lead_time_days ?? 0}<span className="text-sm text-[#6b6b76]">d</span></p><p className="font-mono text-[10px] uppercase text-[#6b6b76]">avg lead time</p></div>
            <div><p className="font-mono text-2xl text-[#0a0a0f]">{s?.matched_events ?? 0}</p><p className="font-mono text-[10px] uppercase text-[#6b6b76]">events caught</p></div>
            <div><p className="font-mono text-2xl text-[#0a0a0f]">{s?.total_simulated_signals ?? 0}</p><p className="font-mono text-[10px] uppercase text-[#6b6b76]">signals fired</p></div>
          </div>
        </div>
        {n?.headline && <p className="mt-4 border-l-4 border-[#1019EC] pl-4 text-lg leading-relaxed text-[#2a2a33]">{n.headline}</p>}

        {/* Methodology */}
        <section className="mt-8">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#1019EC]">Methodology</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-[#3a3a44]">{n?.methodology}</p>
        </section>

        {/* Key findings */}
        <section className="mt-7">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#1019EC]">Key findings</h2>
          <div className="mt-3 space-y-2">
            {(n?.key_findings ?? []).map((k, i) => (
              <div key={i} className="border border-[#e2e2e8] bg-[#fafafb] p-3">
                <div className="flex items-center justify-between">
                  <p className="text-[14px] font-medium text-[#0a0a0f]">{k.title}</p>
                  <span className="shrink-0 font-mono text-[12px]" style={{ color: caughtRateHex(80) }}>{k.match_lead_time_days}d before</span>
                </div>
                <p className="mt-0.5 font-mono text-[11px] text-[#6b6b76]">{prettyCategory(k.simulated_signal_category)} · {k.entity_external_id} → actual: {prettyEventType(k.actual_event_type)}</p>
              </div>
            ))}
            {(n?.key_findings?.length ?? 0) === 0 && <p className="text-[13px] text-[#6b6b76]">No exact/likely matches at sufficient lead time.</p>}
          </div>
        </section>

        {/* Category breakdown */}
        <section className="mt-7">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#1019EC]">Category breakdown</h2>
          <div className="mt-3 space-y-2">
            {(s?.by_category ?? []).map((c) => {
              const pct = c.signals > 0 ? Math.round((c.matched / c.signals) * 100) : 0;
              return (
                <div key={c.category} className="flex items-center gap-3">
                  <span className="w-44 text-[13px] text-[#2a2a33]">{prettyCategory(c.category)}</span>
                  <div className="h-3 flex-1 overflow-hidden bg-[#eeeef2]"><div className="h-full" style={{ width: `${pct}%`, background: "#1019EC" }} /></div>
                  <span className="w-24 font-mono text-[11px] text-[#6b6b76]">{c.matched}/{c.signals} matched</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Limitations */}
        <section className="mt-7">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#1019EC]">Limitations &amp; caveats</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-[#3a3a44]">{n?.limitations}</p>
        </section>

        <div className="mt-8 border-t border-[#e2e2e8] pt-3">
          <p className="font-mono text-[10px] text-[#9a9aa4]">Structurally auditable · content hash {report.content_hash.slice(0, 24)}… · A full AVIR deployment surfaces these continuously, in real time.</p>
        </div>
      </div>
    </div>
  );
}
