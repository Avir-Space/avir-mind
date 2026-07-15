import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * First-run empty state. Not "coming soon" — a considered onboarding moment
 * explaining what will live here and why it matters.
 */
export function EmptyState({
  icon: Icon,
  headline,
  children,
  cta,
  className,
}: {
  icon: LucideIcon;
  headline: string;
  /** Two short paragraphs of explanation. */
  children: React.ReactNode;
  cta?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[60vh] flex-col items-center justify-center px-6 py-16 text-center",
        className,
      )}
    >
      <div className="mb-6 flex h-16 w-16 items-center justify-center border border-border bg-surface/40">
        <Icon className="h-7 w-7 text-label" strokeWidth={1.5} aria-hidden />
      </div>
      <h2 className="font-serif text-2xl text-foreground">{headline}</h2>
      <div className="mt-3 max-w-md space-y-3 text-sm leading-relaxed text-subtext">
        {children}
      </div>
      {cta && <div className="mt-6 flex items-center gap-2">{cta}</div>}
    </div>
  );
}
