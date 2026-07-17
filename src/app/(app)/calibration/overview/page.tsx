"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { PageHeader } from "@/components/avir/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { accuracyHex, CAL_WINDOWS, confidenceLevel, prettyCategory, sampleStatus } from "@/lib/design/calibration";
import { useCalibrationDashboard } from "@/lib/queries/use-calibration";
import { cn } from "@/lib/utils";
import type { GridCell } from "@/types/calibration";

const CONFS = ["high", "medium", "low"] as const;

export default function CalibrationOverviewPage() {
  const [win, setWin] = useState(180);
  const { data: dash, isLoading } = useCalibrationDashboard(win);

  const byCat = useMemo(() => {
    const m = new Map<string, Map<string, GridCell>>();
    for (const cell of dash?.grid ?? []) {
      if (!m.has(cell.signal_category)) m.set(cell.signal_category, new Map());
      m.get(cell.signal_category)!.set(cell.confidence_level, cell);
    }
    return m;
  }, [dash]);

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-4"><Link href="/calibration" className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-label hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /> Calibration</Link></div>
      <PageHeader eyebrow="Proof" title="Calibration Grid" subtitle="Accuracy by category and confidence level. Click any cell to drill down." />

      <div className="flex-1 overflow-y-auto avir-scroll p-6">
        <div className="mb-4 flex items-center gap-2">
          <span className="font-mono text-eyebrow uppercase text-label">Window</span>
          <div className="inline-flex border border-border">
            {CAL_WINDOWS.map((w) => (
              <button key={w.value} type="button" onClick={() => setWin(w.value)}
                className={cn("border-r border-border px-2.5 py-1 text-xs transition-colors last:border-r-0", win === w.value ? "bg-primary text-primary-foreground" : "text-subtext hover:text-foreground")}>{w.label}</button>
            ))}
          </div>
        </div>

        {isLoading ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div> : (
          <div className="space-y-6">
            {[...byCat.entries()].map(([cat, cells]) => (
              <div key={cat}>
                <p className="eyebrow mb-2">{prettyCategory(cat)}</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {CONFS.map((conf) => {
                    const c = cells.get(conf); const cl = confidenceLevel(conf);
                    return (
                      <Link key={conf} href={`/calibration/category/${encodeURIComponent(cat)}`}
                        className="border border-border bg-card p-3 transition-colors hover:border-border-strong"
                        style={{ borderTop: `3px solid ${c ? accuracyHex(c.accuracy_pct) : "#2A2A33"}` }}>
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[11px] uppercase" style={{ color: cl.hex }}>{cl.label}</span>
                          {c && <span className="font-mono text-[10px] uppercase" style={{ color: sampleStatus(c.sample_size_status).hex }}>{sampleStatus(c.sample_size_status).label}</span>}
                        </div>
                        {c ? (
                          <>
                            <p className="mt-2 font-mono text-3xl leading-none" style={{ color: accuracyHex(c.accuracy_pct) }}>{c.accuracy_pct ?? "—"}<span className="text-sm text-hint">%</span></p>
                            <div className="mt-2 h-1.5 overflow-hidden bg-surface"><div className="h-full" style={{ width: `${c.accuracy_pct ?? 0}%`, background: accuracyHex(c.accuracy_pct) }} /></div>
                            <p className="mt-1.5 font-mono text-[10px] text-hint">n={c.total_signals} · {c.measured} measured · {c.correct}✓ {c.incorrect}✗</p>
                          </>
                        ) : <p className="mt-4 text-[12px] text-hint">No data</p>}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
            {byCat.size === 0 && <p className="text-sm text-hint">No calibration data for this window.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
