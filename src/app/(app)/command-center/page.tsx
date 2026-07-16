"use client";

import { Inbox } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/avir/empty-state";
import { LastUpdated } from "@/components/avir/last-updated";
import { PageHeader } from "@/components/avir/page-header";
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
import { useTaskRealtime } from "@/lib/realtime/use-task-realtime";
import { useAuth } from "@/lib/providers/auth-provider";

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
  const { orgId } = useAuth();
  useTaskRealtime(orgId);

  const [severity, setSeverity] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
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
  const stats = data?.stats;
  const queue = data?.queue ?? [];

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        eyebrow="Operations"
        title="Command Center"
        subtitle="Everything that needs attention, in one place."
        meta={<LastUpdated at={dataUpdatedAt} />}
      />

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-3 px-6 py-5 lg:grid-cols-4">
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
