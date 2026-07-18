"use client";

import { useRouter } from "next/navigation";
import { startTransition } from "react";

import { categoryMeta } from "@/lib/design/tasks";
import { SIGNAL_SEVERITY } from "@/lib/design/signals";
import type { Insight } from "@/types/signals";

/** AI Insights strip tile — real fleet-wide signal pattern; drills into Command Center. */
export function InsightTile({ insight }: { insight: Insight }) {
  const router = useRouter();
  const { label } = categoryMeta(insight.category);
  const sev = SIGNAL_SEVERITY[insight.severity] ?? SIGNAL_SEVERITY.info;

  function drill() {
    const q = insight.drill_in_query ?? {};
    const params = new URLSearchParams();
    if (typeof q.category === "string") params.set("category", q.category);
    if (Array.isArray(q.severity)) params.set("severity", (q.severity as string[]).join(","));
    // Wrap in a transition so the URL commits immediately and the destination's
    // loading.tsx shows, instead of the click feeling stuck.
    startTransition(() => router.push(`/signals${params.toString() ? `?${params}` : ""}`));
  }

  return (
    <button
      type="button"
      onClick={drill}
      className="flex h-[104px] items-stretch border border-border bg-card text-left transition-colors duration-micro hover:bg-surface/60"
    >
      {/* severity color bar */}
      <span className="w-1 shrink-0" style={{ background: sev.hex }} aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col justify-between px-3 py-2.5">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate font-mono text-[10px] uppercase tracking-wider text-label">{label}</span>
          <span className="severity-dot shrink-0" style={{ backgroundColor: sev.hex }} />
        </span>
        <span className="truncate text-sm font-medium text-foreground">{insight.title}</span>
        <span className="line-clamp-1 text-[13px] leading-snug text-subtext">{insight.one_liner}</span>
      </span>
    </button>
  );
}
