"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { createClient } from "@/lib/supabase/client";
import type { FleetBoard } from "@/types/tasks";

export type FleetBoardFilters = {
  fleetId?: string | null;
  stationCodes?: string[];
  aircraftTypes?: string[];
  riskBands?: string[];
  parentTypes?: string[];
  search?: string;
};

/** Fleet Kanban via get_fleet_board RPC. */
export function useFleetBoard(filters: FleetBoardFilters) {
  const supabase = useMemo(() => createClient(), []);

  return useQuery({
    queryKey: ["fleet-board", filters],
    queryFn: async (): Promise<FleetBoard> => {
      const { data, error } = await supabase.rpc("get_fleet_board", {
        p_fleet_id: filters.fleetId ?? undefined,
        p_station_codes: filters.stationCodes?.length ? filters.stationCodes : undefined,
        p_aircraft_types: filters.aircraftTypes?.length ? filters.aircraftTypes : undefined,
        p_risk_bands: filters.riskBands?.length ? filters.riskBands : undefined,
        p_parent_types: filters.parentTypes?.length ? filters.parentTypes : undefined,
        p_search: filters.search || undefined,
      });
      if (error) throw error;
      return data as unknown as FleetBoard;
    },
  });
}
