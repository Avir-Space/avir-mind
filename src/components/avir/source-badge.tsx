import { Hand, Radio, SatelliteDish } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { SOURCE_CONFIG } from "@/lib/design/state";
import { cn } from "@/lib/utils";
import type { StateSource } from "@/types/domain";

const ICONS: Record<StateSource, LucideIcon> = {
  telemetry: SatelliteDish,
  ops_system: Radio,
  manual: Hand,
};

/**
 * Data-provenance chip. Every state field in AVIR carries where it came from,
 * so operators can weigh how much to trust it.
 */
export function SourceBadge({
  source,
  className,
  showLabel = true,
}: {
  source: StateSource | string | null | undefined;
  className?: string;
  showLabel?: boolean;
}) {
  const key = (source ?? "manual") as StateSource;
  const meta = SOURCE_CONFIG[key] ?? SOURCE_CONFIG.manual;
  const Icon = ICONS[key] ?? Hand;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border border-border px-2 py-0.5 text-xs font-medium text-subtext",
        className,
      )}
      title={meta.description}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {showLabel && meta.label}
    </span>
  );
}
