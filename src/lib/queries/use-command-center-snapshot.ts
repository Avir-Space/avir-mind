"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { createClient } from "@/lib/supabase/client";
import type { CommandCenterSnapshot } from "@/types/command-center";

/** Operational canvas snapshot via get_command_center_snapshot RPC. */
export function useCommandCenterSnapshot(fleetId: string | null, timeWindowHours: number) {
  const supabase = useMemo(() => createClient(), []);

  return useQuery({
    queryKey: ["cc-snapshot", fleetId, timeWindowHours],
    queryFn: async (): Promise<CommandCenterSnapshot> => {
      const { data, error } = await supabase.rpc("get_command_center_snapshot", {
        p_fleet_id: fleetId ?? undefined,
        p_time_window_hours: timeWindowHours,
      });
      if (error) throw error;
      return data as unknown as CommandCenterSnapshot;
    },
    // Positions drift (mid-air interpolation) and the timeline moves; refresh
    // periodically so the picture stays live without a hard reload.
    refetchInterval: 60_000,
  });
}
