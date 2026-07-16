"use client";

import { useRouter } from "next/navigation";

import { categoryMeta } from "@/lib/design/tasks";
import { SIGNAL_SEVERITY } from "@/lib/design/signals";
import type { Insight } from "@/types/signals";

/** AI Insights strip tile — real fleet-wide signal pattern; drills into Command Center. */
export function InsightTile({ insight }: { insight: Insight }) {
  const router = useRouter();
  const { icon: Icon, label } = categoryMeta(insight.category);
  const sev = SIGNAL_SEVERITY[insight.severity] ?? SIGNAL_SEVERITY.info;

  function drill() {
    const q = insight.drill_in_query ?? {};
    const params = new URLSearchParams();
    if (typeof q.category === "string") params.set("category", q.category);
    if (Array.isArray(q.severity)) params.set("severity", (q.severity as string[]).join(","));
    router.push(`/command-center${params.toString() ? `?${params}` : ""}`);
  }

  return (
    <button
      type="button"
      onClick={drill}
      className="border border-border bg-card p-4 text-left transition-colors duration-micro hover:border-border-strong"
      style={{ borderTop: `2px solid ${sev.hex}` }}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-label" strokeWidth={1.75} />
        <span className="font-mono text-eyebrow uppercase text-label">{insight.title}</span>
      </div>
      <p className="mt-1.5 text-sm leading-snug text-foreground">{insight.one_liner}</p>
      <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-hint">{label}</p>
    </button>
  );
}
