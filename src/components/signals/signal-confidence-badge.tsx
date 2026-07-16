import { CONFIDENCE_HEX, CONFIDENCE_MEANING } from "@/lib/design/signals";
import { cn } from "@/lib/utils";
import type { SignalConfidence } from "@/types/signals";

/**
 * Confidence chip with a tooltip explaining what the level means. When
 * `reasoning` is passed it's appended so operators can weigh the signal.
 */
export function SignalConfidenceBadge({
  confidence,
  reasoning,
  className,
}: {
  confidence: SignalConfidence;
  reasoning?: string;
  className?: string;
}) {
  const meaning = CONFIDENCE_MEANING[confidence] ?? "";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border border-border px-2 py-0.5 text-xs font-medium text-body",
        className,
      )}
      title={reasoning ? `${meaning}\n\nWhy: ${reasoning}` : meaning}
    >
      <span className="severity-dot" style={{ backgroundColor: CONFIDENCE_HEX[confidence] }} aria-hidden />
      {confidence.charAt(0).toUpperCase() + confidence.slice(1)} confidence
    </span>
  );
}
