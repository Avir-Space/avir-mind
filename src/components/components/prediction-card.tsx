import { TrendingUp } from "lucide-react";
import Link from "next/link";

import { ACCURACY_CONFIG, horizonLabel } from "@/lib/design/components";
import { SIGNAL_SEVERITY } from "@/lib/design/signals";
import { cn } from "@/lib/utils";
import type { PredictiveSignal } from "@/types/components";

/** A predictive-maintenance signal, visually distinct from observation signals. */
export function PredictionCard({ signal, compact }: { signal: PredictiveSignal; compact?: boolean }) {
  const sev = SIGNAL_SEVERITY[signal.severity as keyof typeof SIGNAL_SEVERITY] ?? SIGNAL_SEVERITY.info;
  const horizon = horizonLabel(signal.prediction_horizon);
  const acc = ACCURACY_CONFIG[signal.accuracy_result] ?? ACCURACY_CONFIG.pending!;
  const insufficient = signal.signal_class === "insufficient_data";
  const baseline = signal.historical_baseline as
    | { similar_component_count?: number; typical_pattern_summary?: string }
    | null;

  return (
    <div
      className={cn("border border-border bg-card", !signal.is_active && "opacity-60")}
      style={{ borderLeft: `3px solid ${sev.hex}` }}
    >
      <div className={cn("p-4", compact && "p-3")}>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <span className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase tracking-wider text-primary">
            <TrendingUp className="h-3 w-3" /> {insufficient ? "Insufficient data" : "Predicted"}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-body">
            <span className="severity-dot" style={{ backgroundColor: sev.hex }} /> {sev.label}
          </span>
          {signal.predicted_event_type && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-label">{signal.predicted_event_type}</span>
          )}
          {signal.accuracy_result !== "pending" && (
            <span className="ml-auto border px-1.5 py-0.5 font-mono text-[9px] uppercase" style={{ borderColor: acc.hex, color: acc.hex }}>
              {acc.label}
            </span>
          )}
        </div>

        <Link href={`/signals/${signal.id}`} className="mt-2 block text-sm font-medium text-foreground hover:text-primary">
          {signal.title}
        </Link>

        {horizon && (
          <div className="mt-2 inline-flex items-center gap-2 border border-primary/30 bg-primary/5 px-2 py-1">
            <span className="font-mono text-[9px] uppercase tracking-wider text-label">Horizon</span>
            <span className="font-mono text-[12px] text-foreground">{horizon}</span>
          </div>
        )}

        {!compact && <p className="mt-2 text-[13px] leading-relaxed text-subtext">{signal.narrative}</p>}

        {!compact && signal.recommendation && (
          <p className="mt-2 border-l-2 border-primary/40 pl-2 text-[13px] text-body">{signal.recommendation}</p>
        )}

        {!compact && baseline?.typical_pattern_summary && (
          <p className="mt-2 font-mono text-[11px] text-hint">
            Baseline{baseline.similar_component_count != null ? ` (${baseline.similar_component_count} similar)` : ""}: {baseline.typical_pattern_summary}
          </p>
        )}

        <div className="mt-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-hint">
          <span>{signal.confidence} confidence</span>
        </div>
      </div>
    </div>
  );
}
