import { CONFIDENCE_CONFIG, SEVERITY_CONFIG } from "@/lib/design/state";
import { cn } from "@/lib/utils";
import type { StateConfidence } from "@/types/domain";

/**
 * Confidence chip for a state field. Color follows the severity palette:
 * high → green, medium → amber, low → orange.
 */
export function ConfidenceBadge({
  confidence,
  className,
}: {
  confidence: StateConfidence | string | null | undefined;
  className?: string;
}) {
  const key = (confidence ?? "low") as StateConfidence;
  const meta = CONFIDENCE_CONFIG[key] ?? CONFIDENCE_CONFIG.low;
  const hex = SEVERITY_CONFIG[meta.severity].hex;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border border-border px-2 py-0.5 text-xs font-medium text-body",
        className,
      )}
    >
      <span className="severity-dot" style={{ backgroundColor: hex }} aria-hidden />
      {meta.label}
    </span>
  );
}
