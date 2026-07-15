import { STATE_CONFIG } from "@/lib/design/state";
import { cn } from "@/lib/utils";
import type { AircraftStateValue } from "@/types/domain";

/** Aircraft live-state chip. Dot color encodes the state; label spells it out. */
export function StatusBadge({
  state,
  className,
}: {
  state: AircraftStateValue | string | null | undefined;
}& { className?: string }) {
  const key = (state ?? "unknown") as AircraftStateValue;
  const meta = STATE_CONFIG[key] ?? STATE_CONFIG.unknown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border border-border bg-surface/40 px-2 py-0.5 text-xs font-medium text-foreground",
        className,
      )}
      title={meta.description}
    >
      <span className="severity-dot" style={{ backgroundColor: meta.dotHex }} aria-hidden />
      {meta.label}
    </span>
  );
}
