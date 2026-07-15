import { cn } from "@/lib/utils";

/**
 * AVIR wordmark. Heavy tracking, mono, per the brand logo system.
 * The "MIND" lockup sits in electric blue.
 */
export function Logo({ className, collapsed }: { className?: string; collapsed?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex select-none items-baseline font-sans text-sm font-black uppercase tracking-[0.18em] text-foreground",
        className,
      )}
    >
      AVIR
      {!collapsed && <span className="ml-1.5 tracking-[0.18em] text-primary">MIND</span>}
    </span>
  );
}
