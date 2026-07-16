"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { createClient } from "@/lib/supabase/client";
import type { CommandCenterQueue } from "@/types/tasks";

export type CommandCenterFilters = {
  severity?: string[];
  categories?: string[];
  sources?: string[];
  timeWindowHours?: number | null;
  assignedToMe?: boolean;
};

/** Command Center decision queue via the get_command_center_queue RPC. */
export function useCommandCenter(filters: CommandCenterFilters) {
  const supabase = useMemo(() => createClient(), []);

  return useQuery({
    queryKey: ["command-center", filters],
    queryFn: async (): Promise<CommandCenterQueue> => {
      const { data, error } = await supabase.rpc("get_command_center_queue", {
        p_severity: filters.severity?.length ? filters.severity : undefined,
        p_categories: filters.categories?.length ? filters.categories : undefined,
        p_source_systems: filters.sources?.length ? filters.sources : undefined,
        p_time_window_hours: filters.timeWindowHours ?? undefined,
        p_assigned_to_me: filters.assignedToMe ?? false,
        p_limit: 100,
      });
      if (error) throw error;
      return data as unknown as CommandCenterQueue;
    },
  });
}
