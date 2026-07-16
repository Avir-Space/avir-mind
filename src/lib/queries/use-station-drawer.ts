"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { createClient } from "@/lib/supabase/client";
import type { StationDrawerSummary } from "@/types/command-center";

/** Station summary for the Command Center drawer. */
export function useStationDrawer(stationCode: string | null, fleetId: string | null) {
  const supabase = useMemo(() => createClient(), []);

  return useQuery({
    queryKey: ["station-drawer", stationCode, fleetId],
    enabled: !!stationCode,
    queryFn: async (): Promise<StationDrawerSummary> => {
      const { data, error } = await supabase.rpc("get_station_drawer_summary", {
        p_station_code: stationCode!,
        p_fleet_id: fleetId ?? undefined,
      });
      if (error) throw error;
      return data as unknown as StationDrawerSummary;
    },
  });
}
