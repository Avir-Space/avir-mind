"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { createClient } from "@/lib/supabase/client";
import type { Fleet } from "@/types/domain";

export type FleetWithCount = Fleet & { aircraft_count: number };

/** Fleets for the current org, each with its aircraft count. RLS scopes to org. */
export function useFleets() {
  const supabase = useMemo(() => createClient(), []);

  return useQuery({
    queryKey: ["fleets"],
    queryFn: async (): Promise<FleetWithCount[]> => {
      const { data, error } = await supabase
        .from("fleets")
        .select("*, fleet_aircraft(count)")
        .order("name", { ascending: true });
      if (error) throw error;

      return (data ?? []).map((f) => {
        const rel = f.fleet_aircraft as unknown as { count: number }[] | null;
        const { fleet_aircraft: _drop, ...fleet } = f;
        return { ...(fleet as Fleet), aircraft_count: rel?.[0]?.count ?? 0 };
      });
    },
  });
}
