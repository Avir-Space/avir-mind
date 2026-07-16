"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { createClient } from "@/lib/supabase/client";

export type AircraftComponent = {
  id: string;
  component_type: string;
  part_number: string;
  serial_number: string;
  position_code: string | null;
  status: string;
  current_cycles: number | null;
  current_flight_hours: number | null;
  limit_cycles: number | null;
  limit_flight_hours: number | null;
  health_score: number | null;
  next_scheduled_event_type: string | null;
  next_scheduled_event_due_date: string | null;
  active_predictions: number;
};

/** Components installed on one aircraft via get_components_for_aircraft RPC. */
export function useAircraftComponents(aircraftId: string) {
  const supabase = useMemo(() => createClient(), []);

  return useQuery({
    queryKey: ["aircraft-components", aircraftId],
    enabled: Boolean(aircraftId),
    queryFn: async (): Promise<AircraftComponent[]> => {
      const { data, error } = await supabase.rpc("get_components_for_aircraft", { p_aircraft_id: aircraftId });
      if (error) throw error;
      return (data as unknown as AircraftComponent[]) ?? [];
    },
  });
}
