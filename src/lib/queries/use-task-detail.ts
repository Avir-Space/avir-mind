"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { createClient } from "@/lib/supabase/client";
import type { TaskDetail } from "@/types/tasks";

/** Full task detail via get_task_detail RPC. */
export function useTaskDetail(taskId: string) {
  const supabase = useMemo(() => createClient(), []);

  return useQuery({
    queryKey: ["task-detail", taskId],
    enabled: Boolean(taskId),
    queryFn: async (): Promise<TaskDetail | null> => {
      const { data, error } = await supabase.rpc("get_task_detail", { p_task_id: taskId });
      if (error) throw error;
      return (data as unknown as TaskDetail) ?? null;
    },
  });
}
