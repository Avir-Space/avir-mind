import { ACCURACY_CONFIG } from "@/lib/design/components";
import type { PredictiveSignal } from "@/types/components";

/** Calibration breakdown of past predictions (correct / partial / incorrect). */
export function AccuracyChart({ predictions }: { predictions: PredictiveSignal[] }) {
  const measured = predictions.filter((p) => p.accuracy_result !== "pending");
  const counts = { correct: 0, partial: 0, incorrect: 0 } as Record<string, number>;
  for (const p of measured) counts[p.accuracy_result] = (counts[p.accuracy_result] ?? 0) + 1;
  const total = measured.length;

  if (total === 0) {
    return (
      <p className="text-sm text-hint">
        No measured predictions yet — accuracy fills in as predicted events occur.
      </p>
    );
  }

  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden border border-border">
        {(["correct", "partial", "incorrect"] as const).map((k) =>
          counts[k] ? (
            <div key={k} style={{ width: `${((counts[k] ?? 0) / total) * 100}%`, background: ACCURACY_CONFIG[k]!.hex }} title={`${ACCURACY_CONFIG[k]!.label}: ${counts[k]}`} />
          ) : null,
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {(["correct", "partial", "incorrect"] as const).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5 font-mono text-[11px] text-label">
            <span className="h-2 w-2 rounded-full" style={{ background: ACCURACY_CONFIG[k]!.hex }} />
            {ACCURACY_CONFIG[k]!.label} · {counts[k] ?? 0}
          </span>
        ))}
        <span className="font-mono text-[11px] text-hint">{total} measured</span>
      </div>
    </div>
  );
}
