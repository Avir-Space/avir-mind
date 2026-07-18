"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { usd } from "@/lib/design/mro";

type SlaRow = { type: string; target: number | null; actual: number | null; performance_pct: number | null; credits_owed_usd: number | null };
type FindingRow = { severity: string | null; description: string | null; status: string | null };
type ReportContent = {
  period?: { start?: string; end?: string };
  customer?: string;
  aircraft_serviced?: number;
  work_packages?: number;
  findings?: number;
  wip_cost_usd?: number;
  sla?: SlaRow[];
  open_findings?: FindingRow[];
};
export type CustomerReport = {
  id: string;
  report_type: string;
  reporting_period_start: string | null;
  reporting_period_end: string | null;
  generated_at_utc: string | null;
  content: ReportContent | null;
};

const dd = (x: string | null | undefined) => (x ? new Date(x).toLocaleDateString() : "—");
const FINDING_HEX: Record<string, string> = { critical: "#DC2626", major: "#EA580C", moderate: "#CA8A04", minor: "#6B7280" };

/**
 * Presentation-grade customer activity report. Rendered on screen and printed to
 * PDF via the browser (same locked approach as the backtest executive summary —
 * client-side print of styled HTML, scoped by #customer-report in globals.css).
 */
export function CustomerReportView({ report }: { report: CustomerReport }) {
  const c = report.content ?? {};
  const totalCredits = (c.sla ?? []).reduce((sum, s) => sum + Number(s.credits_owed_usd ?? 0), 0);

  return (
    <div>
      {/* Toolbar (screen only) */}
      <div className="flex items-center justify-between border-b border-border bg-surface/40 px-5 py-3 print:hidden">
        <span className="font-mono text-eyebrow uppercase text-label">{report.report_type.replace(/_/g, " ")}</span>
        <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="h-3.5 w-3.5" /> Print / Save PDF</Button>
      </div>

      <div id="customer-report" className="bg-white px-10 py-10 text-[#1a1a22]">
        {/* Cover */}
        <div className="border-b-4 border-[#1019EC] pb-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#1019EC]">AVIR Mind · MRO Customer Report</p>
          <h1 className="mt-3 font-serif text-4xl leading-tight text-[#0a0a0f]">{c.customer ?? "Customer"}</h1>
          <p className="mt-1 font-mono text-[12px] text-[#6b6b76]">
            {report.report_type.replace(/_/g, " ")} · period {dd(c.period?.start ?? report.reporting_period_start)} — {dd(c.period?.end ?? report.reporting_period_end)} · generated {dd(report.generated_at_utc)}
          </p>
        </div>

        {/* Headline tiles */}
        <div className="mt-8 grid grid-cols-4 gap-6">
          <div><p className="font-mono text-3xl text-[#0a0a0f]">{c.aircraft_serviced ?? 0}</p><p className="mt-1 font-mono text-[10px] uppercase text-[#6b6b76]">aircraft serviced</p></div>
          <div><p className="font-mono text-3xl text-[#0a0a0f]">{c.work_packages ?? 0}</p><p className="mt-1 font-mono text-[10px] uppercase text-[#6b6b76]">work packages</p></div>
          <div><p className="font-mono text-3xl text-[#0a0a0f]">{usd(c.wip_cost_usd ?? 0)}</p><p className="mt-1 font-mono text-[10px] uppercase text-[#6b6b76]">work in progress</p></div>
          <div><p className="font-mono text-3xl text-[#0a0a0f]">{c.findings ?? 0}</p><p className="mt-1 font-mono text-[10px] uppercase text-[#6b6b76]">findings</p></div>
        </div>

        {/* SLA table */}
        <section className="mt-8">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#1019EC]">SLA performance</h2>
          <div className="mt-3 border border-[#e2e2e8]">
            <div className="flex items-center gap-4 border-b border-[#e2e2e8] bg-[#fafafb] px-3 py-1.5 font-mono text-[10px] uppercase text-[#6b6b76]">
              <span className="flex-1">Metric</span><span className="w-20">Target</span><span className="w-20">Actual</span><span className="w-24">Performance</span><span className="w-24 text-right">Credit</span>
            </div>
            {(c.sla ?? []).map((s, i) => (
              <div key={i} className="flex items-center gap-4 border-b border-[#eeeef2] px-3 py-2 text-[13px] last:border-b-0">
                <span className="flex-1 text-[#2a2a33]">{String(s.type).replace(/_/g, " ")}</span>
                <span className="w-20 font-mono text-[#3a3a44]">{s.target ?? "—"}</span>
                <span className="w-20 font-mono text-[#3a3a44]">{s.actual ?? "—"}</span>
                <span className="w-24 font-mono" style={{ color: Number(s.performance_pct) >= 100 ? "#16A34A" : "#EA580C" }}>{s.performance_pct ?? "—"}%</span>
                <span className="w-24 text-right font-mono" style={{ color: Number(s.credits_owed_usd) > 0 ? "#DC2626" : "#6b6b76" }}>{usd(s.credits_owed_usd ?? 0)}</span>
              </div>
            ))}
            {(c.sla?.length ?? 0) === 0 && <p className="px-3 py-2 text-[13px] text-[#6b6b76]">No SLA measurements in this period.</p>}
          </div>
          {totalCredits > 0 && (
            <p className="mt-2 font-mono text-[12px] text-[#DC2626]">Total SLA credits owed this period: {usd(totalCredits)}</p>
          )}
        </section>

        {/* Open findings */}
        <section className="mt-7">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#1019EC]">Open findings</h2>
          <div className="mt-3 space-y-2">
            {(c.open_findings ?? []).map((f, i) => (
              <div key={i} className="border border-[#e2e2e8] bg-[#fafafb] p-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase" style={{ color: FINDING_HEX[String(f.severity)] ?? "#6B7280" }}>{f.severity ?? "—"}</span>
                  <span className="font-mono text-[11px] text-[#6b6b76]">{String(f.status ?? "").replace(/_/g, " ")}</span>
                </div>
                <p className="mt-1 text-[13px] text-[#2a2a33]">{f.description ?? "—"}</p>
              </div>
            ))}
            {(c.open_findings?.length ?? 0) === 0 && <p className="text-[13px] text-[#6b6b76]">No open findings.</p>}
          </div>
        </section>

        <div className="mt-8 border-t border-[#e2e2e8] pt-3">
          <p className="font-mono text-[10px] text-[#9a9aa4]">Generated by AVIR Mind · figures reflect the reporting period above.</p>
        </div>
      </div>
    </div>
  );
}
