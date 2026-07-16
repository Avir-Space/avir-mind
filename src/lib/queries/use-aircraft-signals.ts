"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { createClient } from "@/lib/supabase/client";
import type { SignalsResponse } from "@/types/signals";

/** AI signals for one aircraft via get_signals_for_aircraft RPC. */
export function useAircraftSignals(aircraftId: string, includeResolved = false) {
  const supabase = useMemo(() => createClient(), []);

  return useQuery({
    queryKey: ["aircraft-signals", aircraftId, includeResolved],
    enabled: Boolean(aircraftId),
    queryFn: async (): Promise<SignalsResponse> => {
      const { data, error } = await supabase.rpc("get_signals_for_aircraft", {
        p_aircraft_id: aircraftId,
        p_include_resolved: includeResolved,
      });
      if (error) throw error;
      return data as unknown as SignalsResponse;
    },
  });
}
