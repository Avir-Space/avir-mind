"use client";

import { ChevronLeft, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/avir/empty-state";
import { PageHeader } from "@/components/avir/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { crewRole, REGULATOR_LABEL } from "@/lib/design/crew";
import { useRuleConfigurations } from "@/lib/queries/use-crew";

export default function RulesPage() {
  const { data: configs, isLoading } = useRuleConfigurations();

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-4"><Link href="/crew" className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-label hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /> Crew</Link></div>
      <PageHeader eyebrow="Crew" title="Rule Configurations" subtitle="FTL rules as configuration — regulator, CBA overlays, and fatigue extensions." />
      <div className="flex-1 overflow-y-auto avir-scroll p-6">
        {isLoading ? <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
          : !configs || configs.length === 0 ? <EmptyState icon={ShieldCheck} headline="No rule configurations"><p>Configure a regulator rule set to begin evaluating duty periods.</p></EmptyState>
          : (
            <div className="space-y-2">
              {configs.map((c) => {
                const ft = (c.rule_stack as { flight_time_limits?: Record<string, number> }).flight_time_limits ?? {};
                const dt = (c.rule_stack as { duty_time_limits?: Record<string, number> }).duty_time_limits ?? {};
                return (
                  <Link key={c.id} href={`/crew/rules/${c.id}`} className="block border border-border bg-card p-4 transition-colors hover:border-border-strong">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-sm font-medium text-foreground">{c.rule_config_name}</span>
                      <span className="border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase text-label">{REGULATOR_LABEL[c.regulator] ?? c.regulator}</span>
                      {c.cba_overlay_name && <span className="border border-primary/40 px-1.5 py-0.5 font-mono text-[10px] uppercase text-primary">CBA · {c.cba_overlay_name}</span>}
                      {c.is_active && <span className="font-mono text-[10px] uppercase text-severity-low">active</span>}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] text-hint">
                      <span>24h flight ≤ {ft["24h_max_hours"] ?? "—"}h</span>
                      <span>168h ≤ {ft["168h_max_hours"] ?? "—"}h</span>
                      <span>Duty ≤ {dt["max_duty_period_hours"] ?? "—"}h</span>
                      <span>Rest ≥ {dt["min_rest_between_duties_hours"] ?? "—"}h</span>
                      <span>Roles: {(c.applicable_roles ?? []).map((r) => crewRole(r).label).join(", ") || "all"}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
      </div>
    </div>
  );
}
