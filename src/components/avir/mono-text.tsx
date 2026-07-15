import { cn } from "@/lib/utils";

/**
 * Monospace technical text — tail numbers, serials, timestamps, MSNs.
 * Uses JetBrains Mono with tabular figures for clean column alignment.
 */
export function MonoText({
  children,
  className,
  muted,
}: {
  children: React.ReactNode;
  className?: string;
  muted?: boolean;
}) {
  return (
    <span
      className={cn(
        "font-mono text-[0.8125rem] tracking-tight",
        muted ? "text-subtext" : "text-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}
