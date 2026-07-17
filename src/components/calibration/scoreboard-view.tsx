"use client";

import { AlertTriangle, CheckCircle2, FileText } from "lucide-react";

import { prettyCategory } from "@/lib/design/calibration";
import type { Scoreboard } from "@/types/calibration";

/** Renders a scoreboard's summary + honest narrative (strengths + weaknesses). */
export function ScoreboardView({ board }: { board: Scoreboard }) {
  const n = board.narrative ?? {};
  const s = (board.summary_stats ?? {}) as Record<string, unknown>;
  const src = (board.confidence_notes as { generated_by?: string })?.generated_by ?? "deterministic";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="High-confidence accuracy" value={s.high_confidence_accuracy_pct != null ? `${s.high_confidence_accuracy_pct}%` : "—"} />
        <Tile label="Overall accuracy" value={s.overall_accuracy_pct != null ? `${s.overall_accuracy_pct}%` : "—"} />
        <Tile label="Measured outcomes" value={s.total_measured != null ? Number(s.total_measured).toLocaleString() : "—"} />
        <Tile label="Window" value={`${board.window_days}d`} />
      </div>

      <div className="border border-border bg-card p-4">
        <p className="eyebrow mb-1.5 inline-flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Overall narrative</p>
        <p className="text-sm leading-relaxed text-foreground">{n.overall_narrative ?? "—"}</p>
        <p className="mt-2 font-mono text-[10px] uppercase text-hint">Narrative source: {src}</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="border border-severity-low/30 bg-severity-low/5 p-4">
          <p className="eyebrow mb-2 inline-flex items-center gap-1.5 text-severity-low"><CheckCircle2 className="h-3.5 w-3.5" /> Areas of strength</p>
          <ul className="space-y-1.5">
            {(n.areas_of_strength ?? []).map((a, i) => <li key={i} className="text-[13px] text-subtext">• {a}</li>)}
            {(n.areas_of_strength?.length ?? 0) === 0 && <li className="text-[12px] text-hint">None identified at sufficient sample size.</li>}
          </ul>
        </div>
        <div className="border border-severity-high/30 bg-severity-high/5 p-4">
          <p className="eyebrow mb-2 inline-flex items-center gap-1.5 text-severity-high"><AlertTriangle className="h-3.5 w-3.5" /> Areas needing improvement</p>
          <ul className="space-y-1.5">
            {(n.areas_needing_improvement ?? []).map((a, i) => <li key={i} className="text-[13px] text-subtext">• {a}</li>)}
            {(n.areas_needing_improvement?.length ?? 0) === 0 && <li className="text-[12px] text-hint">None flagged at sufficient sample size.</li>}
          </ul>
        </div>
      </div>

      {n.category_narratives && Object.keys(n.category_narratives).length > 0 && (
        <div className="border border-border bg-card p-4">
          <p className="eyebrow mb-2">Category narratives</p>
          <div className="space-y-2.5">
            {Object.entries(n.category_narratives).map(([cat, text]) => (
              <div key={cat}>
                <p className="text-[12px] font-medium text-foreground">{prettyCategory(cat)}</p>
                <p className="text-[12px] leading-snug text-subtext">{text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {n.methodology_notes && (
        <div className="border-l-2 border-border pl-3">
          <p className="eyebrow mb-1">Methodology</p>
          <p className="text-[12px] leading-snug text-hint">{n.methodology_notes}</p>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border bg-card px-4 py-3">
      <p className="font-mono text-xl leading-none text-foreground">{value}</p>
      <p className="mt-1 font-mono text-eyebrow uppercase text-label">{label}</p>
    </div>
  );
}
