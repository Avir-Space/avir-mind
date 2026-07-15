import { cn } from "@/lib/utils";

/**
 * AVIR Mind wordmark — the locked lockup:
 *   "AVIR"  Instrument Serif, weight 400, foreground (white on dark / black on light)
 *   │       hairline divider anchors the two words
 *   "MIND"  Satoshi, caps, weight 500, electric blue #1019EC, wide tracking
 */
export function Logo({ className, collapsed }: { className?: string; collapsed?: boolean }) {
  return (
    <span className={cn("inline-flex select-none items-center gap-2.5", className)}>
      <span className="font-serif text-2xl font-normal leading-none tracking-tight text-foreground">
        AVIR
      </span>
      {!collapsed && (
        <>
          <span className="h-4 w-px bg-border-strong" aria-hidden />
          <span className="font-sans text-xs font-medium uppercase leading-none tracking-[0.28em] text-primary">
            MIND
          </span>
        </>
      )}
    </span>
  );
}
