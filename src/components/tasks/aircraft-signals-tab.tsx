"use client";

import { Activity } from "lucide-react";
import { useState } from "react";

import { SignalCard } from "@/components/tasks/signal-card";
import { FilterSegmented } from "@/components/tasks/task-filter-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { useAircraftTasks } from "@/lib/queries/use-aircraft-tasks";

/** Signals tab content for the Aircraft Profile — real tasks as signal cards. */
export function AircraftSignalsTab({ aircraftId }: { aircraftId: string }) {
  const { data, isLoading } = useAircraftTasks(aircraftId);
  const [filter, setFilter] = useState<"all" | "active" | "done">("all");

  const all = data ?? [];
  const tasks = all.filter((t) =>
    filter === "all" ? true : filter === "done" ? t.status === "done" : t.status !== "done",
  );

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="font-mono text-eyebrow uppercase text-label">{all.length} signals</p>
        <FilterSegmented
          options={[
            { value: "all", label: "All" },
            { value: "active", label: "Active" },
            { value: "done", label: "Done" },
          ]}
          value={filter}
          onChange={(v) => setFilter(v as "all" | "active" | "done")}
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-56 w-full" />)}
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex min-h-[36vh] flex-col items-center justify-center text-center">
          <div className="mb-5 flex h-14 w-14 items-center justify-center border border-border bg-surface/40">
            <Activity className="h-6 w-6 text-label" strokeWidth={1.5} />
          </div>
          <h2 className="font-serif text-xl text-foreground">No signals for this aircraft</h2>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-subtext">
            Try clearing filters, or check that data is syncing from your source systems
            (AMOS, TRAX, SAP, FR).
          </p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {tasks.map((t) => (
            <SignalCard key={t.task_id} item={t} aircraftId={aircraftId} />
          ))}
        </div>
      )}
    </div>
  );
}
