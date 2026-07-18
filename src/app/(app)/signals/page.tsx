"use client";

import { ArrowLeft, CheckCircle2, Inbox, Plus, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";

import { CreateTaskDialog } from "@/components/tasks/create-task-dialog";
import { EmptyState } from "@/components/avir/empty-state";
import { LastUpdated } from "@/components/avir/last-updated";
import { PageHeader } from "@/components/avir/page-header";
import { FleetSignalRefresh } from "@/components/signals/fleet-signal-refresh";
import { FilterDropdown } from "@/components/signals/filter-dropdown";
import { InsightsCalibrationNote } from "@/components/calibration/insights-calibration-note";
import { InsightTile } from "@/components/signals/insight-tile";
import { PredictionCard } from "@/components/components/prediction-card";
import { TaskCard } from "@/components/tasks/task-card";
import { usePredictiveSignals } from "@/lib/queries/use-predictive-signals";
import { FilterSegmented, FilterToggle } from "@/components/tasks/task-filter-bar";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SEVERITY_CONFIG } from "@/lib/design/state";
import { SIGNAL_SEVERITY } from "@/lib/design/signals";
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

type SignalClass = "observation" | "prediction" | "insufficient_data";
type RawSignal = { id: string; title: string; category: string; severity: string; narrative: string; recommendation: string | null; confidence: string; aircraft_id: string | null };

const PAGE_SIZE = 20;

function humanizeCategory(cat: string) {
  return cat.split("_").map((w) => (w.length <= 3 ? w.toUpperCase() : w[0]!.toUpperCase() + w.slice(1))).join(" ");
}

/** Prev/Next pager, shown only when the list exceeds one page. */
function Pager({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  if (total <= PAGE_SIZE) return null;
  const pages = Math.ceil(total / PAGE_SIZE);
  const from = page * PAGE_SIZE + 1;
  const to = Math.min(total, (page + 1) * PAGE_SIZE);
  return (
    <div className="flex items-center justify-between border-t border-border pt-3 font-mono text-[11px] text-hint">
      <span>{from}–{to} of {total}</span>
      <div className="flex items-center gap-2">
        <button type="button" disabled={page === 0} onClick={() => onPage(page - 1)} className="border border-border px-2 py-1 text-body transition-colors hover:border-border-strong disabled:opacity-40">Prev</button>
        <span>Page {page + 1} / {pages}</span>
        <button type="button" disabled={page >= pages - 1} onClick={() => onPage(page + 1)} className="border border-border px-2 py-1 text-body transition-colors hover:border-border-strong disabled:opacity-40">Next</button>
      </div>
    </div>
  );
}

/** signal_id → task_id for every task promoted from a signal/prediction, so cards
 *  can show "View task" instead of a duplicate "Create task" (Bug F pattern). */
function useSignalTaskLinks() {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({
    queryKey: ["signal-task-links"],
    queryFn: async () => {
      const { data } = await supabase
        .from("tasks")
        .select("id, source_signal_id, source_prediction_id" as never)
        .or("source_signal_id.not.is.null,source_prediction_id.not.is.null");
      const map = new Map<string, string>();
      for (const t of (data ?? []) as unknown as { id: string; source_signal_id: string | null; source_prediction_id: string | null }[]) {
        if (t.source_signal_id) map.set(t.source_signal_id, t.id);
        if (t.source_prediction_id) map.set(t.source_prediction_id, t.id);
      }
      return map;
    },
  });
}

/** Per-card action: "View task" if already promoted, else "Create task" (when the
 *  signal is attached to an aircraft). Fleet-wide signals have no aircraft to attach. */
function SignalCardActions({ signal, taskId, onCreate }: { signal: RawSignal; taskId?: string; onCreate: () => void }) {
  if (taskId) {
    return <Link href={`/tasks/${taskId}`} className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline"><CheckCircle2 className="h-3.5 w-3.5" /> View task</Link>;
  }
  if (!signal.aircraft_id) return <span className="font-mono text-[10px] uppercase tracking-wider text-hint">Fleet-wide signal</span>;
  return (
    <button type="button" onClick={onCreate} className="inline-flex items-center gap-1 border border-primary/40 bg-primary/5 px-2 py-1 text-[12px] text-primary transition-colors hover:bg-primary/10">
      <Plus className="h-3.5 w-3.5" /> Create task
    </button>
  );
}

/** A raw AI observation signal (distinct from a prediction — no horizon/accuracy). */
function ObservationCard({ signal }: { signal: { id: string; title: string; category: string; severity: string; narrative: string; recommendation: string | null; confidence: string } }) {
  const sev = SIGNAL_SEVERITY[signal.severity as keyof typeof SIGNAL_SEVERITY] ?? SIGNAL_SEVERITY.info;
  return (
    <div className="border border-border bg-card" style={{ borderLeft: `3px solid ${sev.hex}` }}>
      <div className="p-4">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <span className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase tracking-wider text-primary"><Sparkles className="h-3 w-3" /> Observation</span>
          <span className="inline-flex items-center gap-1.5 text-xs text-body"><span className="severity-dot" style={{ backgroundColor: sev.hex }} /> {sev.label}</span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-label">{humanizeCategory(signal.category)}</span>
        </div>
        <Link href={`/signals/${signal.id}`} className="mt-2 block text-sm font-medium text-foreground hover:text-primary">{signal.title}</Link>
        <p className="mt-2 text-[13px] leading-relaxed text-subtext">{signal.narrative}</p>
        {signal.recommendation && <p className="mt-2 border-l-2 border-primary/40 pl-2 text-[13px] text-body">{signal.recommendation}</p>}
        <div className="mt-2 font-mono text-[10px] uppercase tracking-wider text-hint">{signal.confidence} confidence</div>
      </div>
    </div>
  );
}

/** Raw signals list for the class tabs — observations render as observation
 *  cards, predictions/insufficient as prediction cards. Each row carries a
 *  Create-task / View-task CTA; the list is severity/search-filtered and paged. */
function SignalsList({ signalClass, severities, search }: { signalClass: SignalClass; severities: string[]; search: string }) {
  const { data, isLoading } = usePredictiveSignals(signalClass);
  const { data: linkMap } = useSignalTaskLinks();
  const qc = useQueryClient();
  const [page, setPage] = useState(0);
  const [promote, setPromote] = useState<RawSignal | null>(null);

  const rows = ((data ?? []) as unknown as RawSignal[])
    .filter((p) => severities.length === 0 || severities.includes(p.severity))
    .filter((p) => !search || `${p.title ?? ""} ${p.category ?? ""}`.toLowerCase().includes(search));

  // Reset to the first page whenever the filtered set changes.
  useEffect(() => { setPage(0); }, [signalClass, severities.join(","), search]);

  if (isLoading) {
    return <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}</div>;
  }
  if (rows.length === 0) {
    const headline = signalClass === "observation" ? "No observation signals in this view" : signalClass === "prediction" ? "No active predictions" : "No insufficient-data signals";
    return (
      <EmptyState icon={Inbox} headline={headline}>
        {signalClass === "observation"
          ? <p>AI observation signals about your operation appear here. Use <span className="text-body">Refresh AI Signals</span> to analyze the fleet.</p>
          : <><p>Predictive signals are generated per aircraft from component history.</p><p>Open a component and use <span className="text-body">Refresh Predictions</span>.</p></>}
      </EmptyState>
    );
  }
  const label = signalClass === "observation" ? "observations" : signalClass === "prediction" ? "predictions" : "insufficient-data signals";
  const paged = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  return (
    <div className="space-y-3">
      <p className="font-mono text-eyebrow uppercase text-label">{rows.length} {label}</p>
      {paged.map((p) => {
        const sevHex = SIGNAL_SEVERITY[p.severity as keyof typeof SIGNAL_SEVERITY]?.hex ?? "#94A3B8";
        return (
          <div key={p.id}>
            {signalClass === "observation" ? <ObservationCard signal={p} /> : <PredictionCard signal={p as never} />}
            <div className="flex items-center justify-end border border-t-0 border-border bg-surface/30 px-3 py-1.5" style={{ borderLeft: `3px solid ${sevHex}` }}>
              <SignalCardActions signal={p} taskId={linkMap?.get(p.id)} onCreate={() => setPromote(p)} />
            </div>
          </div>
        );
      })}
      <Pager page={page} total={rows.length} onPage={setPage} />
      {promote && promote.aircraft_id && (
        <CreateTaskDialog
          open={Boolean(promote)}
          onOpenChange={(o) => !o && setPromote(null)}
          aircraftId={promote.aircraft_id}
          sourceSignalId={promote.id}
          defaultTitle={promote.title}
          defaultWhy={promote.narrative}
          onCreated={() => { qc.invalidateQueries({ queryKey: ["signal-task-links"] }); setPromote(null); }}
        />
      )}
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
  const [search, setSearch] = useState("");
  const [sigClass, setSigClass] = useState("");
  const [queuePage, setQueuePage] = useState(0);
  // "All" shows the derived task queue; each class tab shows raw signals of that
  // class (so observation signals are visible, not just tasks derived from them).
  const rawSignalView = sigClass === "observation" || sigClass === "prediction" || sigClass === "insufficient_data";

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
  const q = search.trim().toLowerCase();
  const filteredQueue = q
    ? queue.filter((i) => `${i.title ?? ""} ${i.tail_number ?? ""} ${i.parent_type ?? ""}`.toLowerCase().includes(q))
    : queue;
  const pagedQueue = filteredQueue.slice(queuePage * PAGE_SIZE, queuePage * PAGE_SIZE + PAGE_SIZE);
  // Reset queue paging when the filtered set changes.
  useEffect(() => { setQueuePage(0); }, [q, severity.join(","), categories.join(","), sources.join(","), time, needsYou]);

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
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="eyebrow inline-flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-primary" /> AI Insights
            </p>
            <InsightsCalibrationNote />
          </div>
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
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="h-8 w-44" aria-label="Search signals" />
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
          {rawSignalView ? (
            <SignalsList signalClass={sigClass as SignalClass} severities={severity} search={q} />
          ) : isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : filteredQueue.length === 0 ? (
            <EmptyState icon={Inbox} headline="No signals in this view">
              <p>Nothing matches your current filters.</p>
              <p>Try widening your filters{q ? " or clearing the search" : ""} or clearing the &quot;Needs YOU&quot; toggle.</p>
            </EmptyState>
          ) : (
            <div className="space-y-2">
              <p className="font-mono text-eyebrow uppercase text-label">{filteredQueue.length} signals</p>
              {pagedQueue.map((item) => (
                <TaskCard key={item.task_id} item={item} />
              ))}
              <Pager page={queuePage} total={filteredQueue.length} onPage={setQueuePage} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
