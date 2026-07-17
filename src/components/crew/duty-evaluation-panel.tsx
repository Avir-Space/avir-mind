import { compliance, fatigueBand } from "@/lib/design/crew";
import { cn } from "@/lib/utils";
import type { DutyEvaluation } from "@/types/crew";

/** Renders the FTL rules-engine output for a duty proposal. */
export function DutyEvaluationPanel({ evaluation }: { evaluation: DutyEvaluation }) {
  const overall = compliance(evaluation.overall_result);
  const fb = fatigueBand(evaluation.fatigue_score);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider" style={{ borderColor: overall.hex, color: overall.hex }}>
          <span className="h-2 w-2 rounded-full" style={{ background: overall.hex }} /> {overall.label}
        </span>
        <span className="font-mono text-[11px] text-hint">{evaluation.rule_config}{evaluation.regulator ? ` · ${evaluation.regulator}` : ""}</span>
        <span className="ml-auto inline-flex items-center gap-2">
          <span className="font-mono text-eyebrow uppercase text-label">Fatigue</span>
          <span className="relative h-1.5 w-20 bg-border"><span className="absolute inset-y-0 left-0" style={{ width: `${evaluation.fatigue_score}%`, background: fb.hex }} /></span>
          <span className="font-mono text-xs" style={{ color: fb.hex }}>{evaluation.fatigue_score} · {fb.label}</span>
        </span>
      </div>

      <div className="mt-3 overflow-x-auto avir-scroll border border-border">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-left">{["Rule", "Limit", "Projected", "Margin", "Result"].map((h) => <th key={h} className="px-3 py-1.5 font-mono text-eyebrow uppercase text-label">{h}</th>)}</tr></thead>
          <tbody>
            {evaluation.rule_evaluations.map((r, i) => {
              const rc = compliance(r.result);
              return (
                <tr key={i} className="border-b border-border/50">
                  <td className="px-3 py-1.5 text-body">{r.rule_name}</td>
                  <td className="px-3 py-1.5 font-mono text-subtext">{r.threshold}</td>
                  <td className={cn("px-3 py-1.5 font-mono", r.result === "violation" && "text-severity-critical", r.result === "warning" && "text-severity-medium")}>{r.projected}</td>
                  <td className="px-3 py-1.5 font-mono text-hint">{r.margin}</td>
                  <td className="px-3 py-1.5"><span className="font-mono text-[10px] uppercase" style={{ color: rc.hex }}>{rc.label}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(evaluation.violations?.length > 0 || evaluation.warnings?.length > 0) && (
        <ul className="mt-2 space-y-1">
          {(evaluation.violations ?? []).map((v, i) => <li key={`v${i}`} className="text-[12px] text-severity-critical">✕ {v}</li>)}
          {(evaluation.warnings ?? []).map((w, i) => <li key={`w${i}`} className="text-[12px] text-severity-medium">⚠ {w}</li>)}
        </ul>
      )}
    </div>
  );
}
