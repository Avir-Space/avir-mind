import { Sparkles } from "lucide-react";

import { SOURCE_SYSTEM_CONFIG } from "@/lib/design/tasks";
import { cn } from "@/lib/utils";
import type { SourceSystem } from "@/types/tasks";

/**
 * Task provenance badge — the routing thesis made visible. `avir` (native
 * AI-generated) is tinted with the brand accent; upstream systems are neutral.
 */
export function TaskSourceBadge({
  system,
  referenceId,
  className,
}: {
  system: SourceSystem | string;
  referenceId?: string | null;
  className?: string;
}) {
  const meta = SOURCE_SYSTEM_CONFIG[system as SourceSystem] ?? {
    label: String(system).toUpperCase(),
    native: false,
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider",
        meta.native ? "border-primary/40 text-primary" : "border-border text-subtext",
        className,
      )}
      title={referenceId ? `${meta.label} · ${referenceId}` : meta.label}
    >
      {meta.native && <Sparkles className="h-2.5 w-2.5" />}
      {meta.label}
      {referenceId && <span className="text-hint">{referenceId}</span>}
    </span>
  );
}
