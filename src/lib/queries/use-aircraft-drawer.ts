"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { createClient } from "@/lib/supabase/client";
import type { AircraftDrawerSummary } from "@/types/command-center";

/** Compact aircraft summary for the Command Center drawer. */
export function useAircraftDrawer(aircraftId: string | null) {
  const supabase = useMemo(() => createClient(), []);

  return useQuery({
    queryKey: ["aircraft-drawer", aircraftId],
    enabled: !!aircraftId,
    queryFn: async (): Promise<AircraftDrawerSummary> => {
      const { data, error } = await supabase.rpc("get_aircraft_drawer_summary", {
        p_aircraft_id: aircraftId!,
      });
      if (error) throw error;
      return data as unknown as AircraftDrawerSummary;
    },
  });
}
