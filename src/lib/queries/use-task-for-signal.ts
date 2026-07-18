"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { createClient } from "@/lib/supabase/client";

/**
 * The task already created from a given signal/prediction (via
 * source_signal_id / source_prediction_id), or null. Lets the UI show
 * "View task" instead of a duplicate "Create Task".
 */
export function useTaskForSignal(signalId: string | null | undefined) {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({
    queryKey: ["task-for-signal", signalId],
    enabled: Boolean(signalId),
    queryFn: async (): Promise<string | null> => {
      const { data } = await supabase.rpc("get_task_for_signal" as never, { p_signal_id: signalId } as never);
      return (data as string | null) ?? null;
    },
  });
}
