"use client";

import { ArrowLeft, Inbox, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { EmptyState } from "@/components/avir/empty-state";
import { LastUpdated } from "@/components/avir/last-updated";
import { PageHeader } from "@/components/avir/page-header";
import { FleetSignalRefresh } from "@/components/signals/fleet-signal-refresh";
import { FilterDropdown } from "@/components/signals/filter-dropdown";
import { InsightTile } from "@/components/signals/insight-tile";
import { PredictionCard } from "@/components/components/prediction-card";
import { TaskCard } from "@/components/tasks/task-card";
import { usePredictiveSignals } from "@/lib/queries/use-predictive-signals";
import { FilterSegmented, FilterToggle } from "@/components/tasks/task-filter-bar";
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
  { value: "168", label: "7d" },
  { value: "720", label: "30d" },
  { value: "", label: "All" },
];
const CLASS_OPTIONS = [
  { value: "", label: "All" },
  { value: "observation", label: "Observations" },
  { value: "prediction", label: "Predictions" },
  { value: "insufficient_data", label: "Insufficient" },
];

function PredictionsList({ signalClass }: { signalClass: "prediction" | "insufficient_data" }) {
  const { data, isLoading } = usePredictiveSignals(signalClass);
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
      </div>
    );
  }
  if (!data || data.length === 0) {
    return (
      <EmptyState icon={Inbox} headline={signalClass === "prediction" ? "No active predictions" : "No insufficient-data signals"}>
        <p>Predictive signals are generated per aircraft from component history.</p>
        <p>Open a component and use <span className="text-body">Refresh Predictions</span>.</p>
      </EmptyState>
    );
  }
  return (
    <div className="space-y-3">
      <p className="font-mono text-eyebrow uppercase text-label">{data.length} {signalClass === "prediction" ? "predictions" : "insufficient-data signals"}</p>
      {data.map((p) => <PredictionCard key={p.id} signal={p} />)}
    </div>
  );
}

const LABELS: Record<string, string> = Object.fromEntries(
  [...SEVERITY_OPTIONS, ...CATEGORY_OPTIONS, ...SOURCE_OPTIONS].map((o) => [o.value, o.label]),
);

function StatTile({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="border border-border bg-card px-5 py-4">
      <p className={`font-mono text-3xl leading-none ${tone ?? "text-foreground"}`}>{value}</p>
      <p className="mt-1.5 font-mono text-eyebrow uppercase text-label">{label}</p>
    </div>
  );
}

export default function SignalsPage() {
  return (
    <Suspense fallback={null}>
      <SignalsInbox />
    </Suspense>
  );
}

function SignalsInbox() {
  const { orgId } = useAuth();
  useTaskRealtime(orgId);
  useSignalRealtime(orgId);
  const { generate } = useSignalActions();
  const params = useSearchParams();

  const [severity, setSeverity] = useState<string[]>(
    params.get("severity") ? params.get("severity")!.split(",") : [],
  );
  const [categories, setCategories] = useState<string[]>(
    params.get("category") ? [params.get("category")!] : [],
  );
  const [sources, setSources] = useState<string[]>([]);
  const [time, setTime] = useState("");
  const [needsYou, setNeedsYou] = useState(false);
  const [sigClass, setSigClass] = useState("");
  const predictionView = sigClass === "prediction" || sigClass === "insufficient_data";

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
      await Promise.all(
        (acs ?? []).map((a) =>
          generate(a.id as string, { force: false, runType: "scheduled" }).catch(() => {}),
        ),
      );
    })();
  }, [orgId, generate]);

  // Applied-filter chips (removable). Window included when not "All".
  const chips: { key: string; label: string; remove: () => void }[] = [
    ...severity.map((v) => ({ key: `sev-${v}`, label: LABELS[v] ?? v, remove: () => setSeverity(severity.filter((x) => x !== v)) })),
    ...categories.map((v) => ({ key: `cat-${v}`, label: LABELS[v] ?? v, remove: () => setCategories(categories.filter((x) => x !== v)) })),
    ...sources.map((v) => ({ key: `src-${v}`, label: LABELS[v] ?? v, remove: () => setSources(sources.filter((x) => x !== v)) })),
    ...(time ? [{ key: "time", label: TIME_OPTIONS.find((t) => t.value === time)?.label ?? time, remove: () => setTime("") }] : []),
  ];
  const anyActive = chips.length > 0 || needsYou;
  function clearAll() {
    setSeverity([]);
    setCategories([]);
    setSources([]);
    setTime("");
    setNeedsYou(false);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-6 pt-4">
        <Link
          href="/command-center"
          className="inline-flex items-center gap-1.5 font-mono text-eyebrow uppercase tracking-wider text-label transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Back to Command Center
        </Link>
      </div>

      <PageHeader
        eyebrow="Operations"
        title="Signals"
        subtitle="Signals and tasks across your operation, ranked by severity."
        meta={<LastUpdated at={dataUpdatedAt} />}
        actions={<FleetSignalRefresh orgId={orgId} />}
      />

      {/* Single scroll region — stats + insights scroll away; filter row stays sticky */}
      <div className="min-h-0 flex-1 overflow-y-auto avir-scroll">
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

        {/* AI Insights strip */}
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

        {/* Sticky filter surface */}
        <div className="sticky top-0 z-20 border-y border-border bg-page shadow-[0_2px_10px_rgba(0,0,0,0.06)]">
          <div className="flex h-12 items-center gap-3 px-6">
            <FilterSegmented label="Class" options={CLASS_OPTIONS} value={sigClass} onChange={setSigClass} />
            <FilterDropdown label="Severity" options={SEVERITY_OPTIONS} selected={severity} onChange={setSeverity} />
            <FilterDropdown label="Category" options={CATEGORY_OPTIONS} selected={categories} onChange={setCategories} />
            <FilterDropdown label="Source" options={SOURCE_OPTIONS} selected={sources} onChange={setSources} />
            <FilterSegmented label="Window" options={TIME_OPTIONS} value={time} onChange={setTime} />
            <div className="ml-auto">
              <FilterToggle label="Needs YOU" active={needsYou} onChange={setNeedsYou} />
            </div>
          </div>
          {anyActive && (
            <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-6 py-1.5">
              {needsYou && (
                <button
                  type="button"
                  onClick={() => setNeedsYou(false)}
                  className="inline-flex items-center gap-1 border border-primary bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary"
                >
                  Needs YOU <X className="h-2.5 w-2.5" />
                </button>
              )}
              {chips.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={c.remove}
                  className="inline-flex items-center gap-1 border border-border bg-card px-1.5 py-0.5 text-[11px] text-body transition-colors hover:border-border-strong"
                >
                  {c.label} <X className="h-2.5 w-2.5 text-label" />
                </button>
              ))}
              <button type="button" onClick={clearAll} className="ml-auto text-[11px] text-primary hover:underline">
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* Queue (tasks) or predictions view, depending on class filter */}
        <div className="p-6">
          {predictionView ? (
            <PredictionsList signalClass={sigClass as "prediction" | "insufficient_data"} />
          ) : isLoading ? (
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
    </div>
  );
}
