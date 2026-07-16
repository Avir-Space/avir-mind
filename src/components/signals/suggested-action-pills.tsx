"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";
import type { SuggestedAction } from "@/types/signals";

/**
 * What-if alternatives as pill buttons. Clicking reveals the description
 * inline — actual compute lands in Phase 10 (Simulation Engine).
 */
export function SuggestedActionPills({
  actions,
  onExplore,
  className,
}: {
  actions: SuggestedAction[];
  onExplore?: (action: SuggestedAction) => void;
  className?: string;
}) {
  const [open, setOpen] = useState<number | null>(null);

  if (!actions?.length) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap gap-1.5">
        {actions.slice(0, 3).map((a, i) => (
          <button
            key={i}
            type="button"
            onClick={() => {
              setOpen(open === i ? null : i);
              onExplore?.(a);
            }}
            className={cn(
              "inline-flex items-center gap-1.5 border px-2 py-0.5 text-xs transition-colors duration-micro",
              open === i
                ? "border-primary bg-primary/10 text-primary"
                : "border-border-strong text-body hover:text-foreground",
            )}
          >
            <Sparkles className="h-3 w-3" />
            {a.label}
          </button>
        ))}
      </div>
      {open !== null && actions[open] && (
        <p className="border-l-2 border-primary/40 pl-3 text-[13px] leading-snug text-subtext">
          {actions[open].description}
          <span className="ml-1 font-mono text-eyebrow uppercase text-hint">· compute in Phase 10</span>
        </p>
      )}
    </div>
  );
}
