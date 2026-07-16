"use client";

import { Inbox, Sparkles } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { EmptyState } from "@/components/avir/empty-state";
import { LastUpdated } from "@/components/avir/last-updated";
import { PageHeader } from "@/components/avir/page-header";
import { FleetSignalRefresh } from "@/components/signals/fleet-signal-refresh";
import { InsightTile } from "@/components/signals/insight-tile";
import { TaskCard } from "@/components/tasks/task-card";
import {
  FilterChipGroup,
  FilterSegmented,
  FilterToggle,
  TaskFilterBar,
} from "@/components/tasks/task-filter-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { SEVERITY_CONFIG } from "@/lib/design/state";
import { CATEGORY_CONFIG, SOURCE_SYSTEM_CONFIG } from "@/lib/design/tasks";
import { useCommandCenter, type CommandCenterFilters } from "@/lib/queries/use-command-center";
import { useSignalInsights } from "@/lib/queries/use-signal-insights";
import { useSignalActions } from "@/lib/mutations/use-signal-actions";
import { useTaskRealtime } from "@/lib/realtime/use-task-realtime";
import { useSignalRealtime } from "@/lib/realtime/use-signal-realtime";
import { useAuth } from "@/lib/providers/auth-provider";
import { createClient } from "@/lib/supabase/client";

const SEVERITY_OPTIONS = (["critical", "high", "medium", "low", "info"] as const).map((k) => ({
  value: k,
  label: SEVERITY_CONFIG[k].label,
}));
const CATEGORY_OPTIONS = Object.keys(CATEGORY_CONFIG).map((k) => ({ value: k, label: CATEGORY_CONFIG[k]!.label }));
const SOURCE_OPTIONS = Object.entries(SOURCE_SYSTEM_CONFIG).map(([value, v]) => ({ value, label: v.label }));
const TIME_OPTIONS = [
  { value: "24", label: "24h" },
  { value: "48", label: "48h" },
  { value: "168", label: "7d" },
  { value: "720", label: "30d" },
  { value: "", label: "All" },
];

function StatTile({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="border border-border bg-card px-5 py-4">
      <p className={`font-mono text-3xl leading-none ${tone ?? "text-foreground"}`}>{value}</p>
      <p className="mt-1.5 font-mono text-eyebrow uppercase text-label">{label}</p>
    </div>
  );
}

export default function CommandCenterPage() {
  return (
    <Suspense fallback={null}>
      <CommandCenter />
    </Suspense>
  );
}

function CommandCenter() {
  const { orgId } = useAuth();
  useTaskRealtime(orgId);
  useSignalRealtime(orgId);
  const { generate } = useSignalActions();
  const params = useSearchParams();

  // Drill-in from an insight tile seeds the initial filters.
  const [severity, setSeverity] = useState<string[]>(
    params.get("severity") ? params.get("severity")!.split(",") : [],
  );
  const [categories, setCategories] = useState<string[]>(
    params.get("category") ? [params.get("category")!] : [],
  );
  const [sources, setSources] = useState<string[]>([]);
  const [time, setTime] = useState("");
  const [needsYou, setNeedsYou] = useState(false);

  const filters: CommandCenterFilters = {
    severity,
    categories,
    sources,
    timeWindowHours: time ? Number(time) : null,
    assignedToMe: needsYou,
  };
  const { data, isLoading, dataUpdatedAt } = useCommandCenter(filters);
  const { data: insights } = useSignalInsights();
  const stats = data?.stats;
  const queue = data?.queue ?? [];

  // First-login: generate signals for up to 6 aircraft when the org has none.
  const seeded = useRef(false);
  useEffect(() => {
    if (!orgId || seeded.current) return;
    const key = `avir_sig_seed_${orgId}`;
    if (typeof window !== "undefined" && sessionStorage.getItem(key)) return;
    seeded.current = true;
    (async () => {
      const supabase = createClient();
      const { count } = await supabase
        .from("signals")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId);
      if ((count ?? 0) > 0) return;
      if (typeof window !== "undefined") sessionStorage.setItem(key, "1");
      const { data: acs } = await supabase.from("aircraft").select("id").eq("org_id", orgId).limit(6);
      // Generate the 6 in parallel (per-org concurrency cap is 10) so they all
      // complete within ~60s rather than sequentially over several minutes.
      await Promise.all(
        (acs ?? []).map((a) =>
          generate(a.id as string, { force: false, runType: "scheduled" }).catch(() => {}),
        ),
      );
    })();
  }, [orgId, generate]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        eyebrow="Operations"
        title="Command Center"
        subtitle="Everything that needs attention, in one place."
        meta={<LastUpdated at={dataUpdatedAt} />}
        actions={<FleetSignalRefresh orgId={orgId} />}
      />

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-3 px-6 pt-5 lg:grid-cols-4">
        {isLoading || !stats ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[76px]" />)
        ) : (
          <>
            <StatTile label="Active Signals" value={stats.active_signals} />
            <StatTile label="Blocking Dispatch" value={stats.blocking_dispatch} tone="text-severity-high" />
            <StatTile label="AOG Aircraft" value={stats.aog_aircraft} tone="text-severity-critical" />
            <StatTile label="Team Load" value={stats.team_load} />
          </>
        )}
      </div>

      {/* AI Insights strip — real fleet-wide signal patterns */}
      <div className="px-6 py-5">
        <p className="eyebrow mb-2 inline-flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-primary" /> AI Insights
        </p>
        {insights && insights.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {insights.map((ins, i) => (
              <InsightTile key={i} insight={ins} />
            ))}
          </div>
        ) : (
          <div className="border border-dashed border-border px-4 py-3 text-sm text-hint">
            No AI insights yet — signals are generated per aircraft. Use{" "}
            <span className="text-body">Refresh AI Signals</span> to analyze the fleet.
          </div>
        )}
      </div>

      {/* Filters */}
      <TaskFilterBar>
        <FilterChipGroup label="Severity" options={SEVERITY_OPTIONS} selected={severity} onChange={setSeverity} />
        <FilterChipGroup label="Category" options={CATEGORY_OPTIONS} selected={categories} onChange={setCategories} />
        <FilterChipGroup label="Source" options={SOURCE_OPTIONS} selected={sources} onChange={setSources} />
        <FilterSegmented label="Window" options={TIME_OPTIONS} value={time} onChange={setTime} />
        <FilterToggle label="Needs YOU" active={needsYou} onChange={setNeedsYou} />
      </TaskFilterBar>

      {/* Queue */}
      <div className="flex-1 overflow-y-auto avir-scroll p-6">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : queue.length === 0 ? (
          <EmptyState icon={Inbox} headline="No signals in this view">
            <p>Nothing matches your current filters.</p>
            <p>Try widening your filters or clearing the &quot;Needs YOU&quot; toggle.</p>
          </EmptyState>
        ) : (
          <div className="space-y-2">
            <p className="font-mono text-eyebrow uppercase text-label">{queue.length} signals</p>
            {queue.map((item) => (
              <TaskCard key={item.task_id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
