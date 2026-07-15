import { SEVERITY_CONFIG } from "@/lib/design/state";
import { cn } from "@/lib/utils";
import type { Severity } from "@/types/domain";

/**
 * Severity chip. The dot is the single permitted circle in the product.
 * Colors are fixed brand values and identical everywhere severity appears.
 */
export function SeverityBadge({
  severity,
  className,
  showLabel = true,
}: {
  severity: Severity;
  className?: string;
  showLabel?: boolean;
}) {
  const meta = SEVERITY_CONFIG[severity];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border border-border px-2 py-0.5 text-xs font-medium text-body",
        className,
      )}
    >
      <span className="severity-dot" style={{ backgroundColor: meta.hex }} aria-hidden />
      {showLabel && meta.label}
    </span>
  );
}
