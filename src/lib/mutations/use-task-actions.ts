"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { createClient } from "@/lib/supabase/client";
import type { TaskStatus } from "@/types/tasks";

/**
 * All task mutations, each wrapping an RPC and invalidating the affected
 * queries so the UI (queue, board, detail) stays consistent.
 */
export function useTaskActions() {
  const supabase = useMemo(() => createClient(), []);
  const qc = useQueryClient();

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["command-center"] });
    qc.invalidateQueries({ queryKey: ["fleet-board"] });
    qc.invalidateQueries({ queryKey: ["aircraft-tasks"] });
    qc.invalidateQueries({ queryKey: ["task-detail"] });
  };

  const call = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await supabase.rpc(fn as never, args as never);
    if (error) throw error;
    return data;
  };

  const acknowledge = useMutation({
    mutationFn: (taskId: string) => call("acknowledge_task", { p_task_id: taskId }),
    onSuccess: invalidateAll,
  });

  const moveStatus = useMutation({
    mutationFn: (v: { taskId: string; status: TaskStatus; rank?: number }) =>
      call("move_task_status", { p_task_id: v.taskId, p_new_status: v.status, p_new_rank: v.rank ?? null }),
    onSuccess: invalidateAll,
  });

  const assign = useMutation({
    mutationFn: (v: { taskId: string; assigneeUserId: string | null }) =>
      call("assign_task", { p_task_id: v.taskId, p_assignee_user_id: v.assigneeUserId }),
    onSuccess: invalidateAll,
  });

  const addComment = useMutation({
    mutationFn: (v: { taskId: string; body: string }) =>
      call("create_task_event", { p_task_id: v.taskId, p_event_type: "comment", p_body: v.body }),
    onSuccess: invalidateAll,
  });

  const logWork = useMutation({
    mutationFn: (v: { taskId: string; minutes: number; description: string; workDate?: string }) =>
      call("log_work", {
        p_task_id: v.taskId,
        p_time_spent_minutes: v.minutes,
        p_description: v.description,
        p_work_date: v.workDate ?? undefined,
      }),
    onSuccess: invalidateAll,
  });

  const setPinned = useMutation({
    mutationFn: async (v: { taskId: string; pinned: boolean }) => {
      const { error } = await supabase.from("tasks").update({ pinned: v.pinned }).eq("id", v.taskId);
      if (error) throw error;
      await call("create_task_event", { p_task_id: v.taskId, p_event_type: v.pinned ? "pinned" : "unpinned" });
    },
    onSuccess: invalidateAll,
  });

  const createTask = useMutation({
    mutationFn: (v: {
      aircraftId: string;
      title: string;
      whySummary?: string;
      parentType: string;
      subType: string;
      riskBand?: string;
      dispatchBlocking?: boolean;
      stationCode?: string | null;
    }) =>
      call("create_task", {
        p_aircraft_id: v.aircraftId,
        p_title: v.title,
        p_why_summary: v.whySummary ?? null,
        p_parent_type: v.parentType,
        p_sub_type: v.subType,
        p_risk_band: v.riskBand ?? "medium",
        p_station_code: v.stationCode ?? null,
        p_dispatch_blocking: v.dispatchBlocking ?? false,
        p_source_system: "avir",
      }),
    onSuccess: invalidateAll,
  });

  return { acknowledge, moveStatus, assign, addComment, logWork, createTask, setPinned };
}
