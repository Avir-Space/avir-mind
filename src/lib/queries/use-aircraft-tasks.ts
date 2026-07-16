"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { createClient } from "@/lib/supabase/client";
import { severityForTask } from "@/lib/design/tasks";
import type { QueueItem, RiskBand } from "@/types/tasks";

/**
 * All tasks for one aircraft (direct table read, RLS-scoped), shaped like queue
 * items so the SignalCard/KanbanCard components can consume them uniformly.
 */
export function useAircraftTasks(aircraftId: string) {
  const supabase = useMemo(() => createClient(), []);

  return useQuery({
    queryKey: ["aircraft-tasks", aircraftId],
    enabled: Boolean(aircraftId),
    queryFn: async (): Promise<QueueItem[]> => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*, aircraft(tail_number), task_sources(source_system, source_reference_id, source_url)")
        .eq("aircraft_id", aircraftId)
        .order("created_at_utc", { ascending: false });
      if (error) throw error;

      return (data ?? []).map((t) => {
        const ac = t.aircraft as unknown as { tail_number: string } | null;
        return {
          task_id: t.id,
          aircraft_id: t.aircraft_id,
          tail_number: ac?.tail_number ?? "",
          title: t.title,
          why_summary: t.why_summary,
          parent_type: t.parent_type,
          sub_type: t.sub_type,
          status: t.status,
          risk_band: t.risk_band,
          severity: severityForTask(t.risk_band as RiskBand, t.dispatch_blocking, t.aog),
          dispatch_blocking: t.dispatch_blocking,
          aog: t.aog,
          station_code: t.station_code,
          facility: t.facility,
          due_at_utc: t.due_at_utc,
          created_at_utc: t.created_at_utc,
          updated_at_utc: t.updated_at_utc,
          assignee_user_id: t.assignee_user_id,
          sources: (t.task_sources as unknown as QueueItem["sources"]) ?? [],
          acknowledged_by_me: false,
          recent_events: [],
        } as QueueItem;
      });
    },
  });
}
