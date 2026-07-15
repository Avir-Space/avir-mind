"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { createClient } from "@/lib/supabase/client";
import type { AircraftWithState, Fleet } from "@/types/domain";

export type AircraftDetail = AircraftWithState & { fleets: Fleet[] };

/** A single aircraft with live state and the fleets it belongs to. */
export function useAircraftDetail(aircraftId: string) {
  const supabase = useMemo(() => createClient(), []);

  return useQuery({
    queryKey: ["aircraft", aircraftId],
    enabled: Boolean(aircraftId),
    queryFn: async (): Promise<AircraftDetail | null> => {
      const { data, error } = await supabase
        .from("aircraft")
        .select("*, aircraft_state(*), fleet_aircraft(fleets(*))")
        .eq("id", aircraftId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      const state = data.aircraft_state as unknown;
      const links = (data.fleet_aircraft as unknown as { fleets: Fleet | null }[]) ?? [];
      const { fleet_aircraft: _drop, ...aircraft } = data;

      return {
        ...(aircraft as AircraftWithState),
        aircraft_state: Array.isArray(state) ? (state[0] ?? null) : (state ?? null),
        fleets: links.map((l) => l.fleets).filter((f): f is Fleet => Boolean(f)),
      };
    },
  });
}
