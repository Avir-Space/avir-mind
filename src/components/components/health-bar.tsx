import { healthBand } from "@/lib/design/components";
import { cn } from "@/lib/utils";

/** Compact health-score bar with numeric readout. */
export function HealthBar({ score, className }: { score: number | null | undefined; className?: string }) {
  const band = healthBand(score);
  const pct = score == null ? 0 : Math.max(2, Math.min(100, score));
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="relative h-1.5 w-16 shrink-0 bg-border">
        <div className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, background: band.hex }} />
      </div>
      <span className="font-mono text-xs tabular-nums" style={{ color: band.hex }}>
        {score == null ? "—" : score}
      </span>
    </div>
  );
}

export function HealthDot({ score }: { score: number | null | undefined }) {
  const band = healthBand(score);
  return <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: band.hex }} title={band.label} />;
}
