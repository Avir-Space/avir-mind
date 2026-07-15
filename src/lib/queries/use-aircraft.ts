"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { createClient } from "@/lib/supabase/client";
import type { AircraftWithState } from "@/types/domain";

/** All aircraft for the current org with their live state, tail-sorted. */
export function useAircraft() {
  const supabase = useMemo(() => createClient(), []);

  return useQuery({
    queryKey: ["aircraft"],
    queryFn: async (): Promise<AircraftWithState[]> => {
      const { data, error } = await supabase
        .from("aircraft")
        .select("*, aircraft_state(*)")
        .order("tail_number", { ascending: true });
      if (error) throw error;

      return (data ?? []).map((a) => {
        const state = a.aircraft_state as unknown;
        return {
          ...a,
          aircraft_state: Array.isArray(state) ? (state[0] ?? null) : (state ?? null),
        } as AircraftWithState;
      });
    },
  });
}
