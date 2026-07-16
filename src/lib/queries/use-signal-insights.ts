"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { createClient } from "@/lib/supabase/client";
import type { Insight } from "@/types/signals";

/** Command Center AI Insights strip — real fleet-wide signal patterns. */
export function useSignalInsights() {
  const supabase = useMemo(() => createClient(), []);

  return useQuery({
    queryKey: ["signal-insights"],
    queryFn: async (): Promise<Insight[]> => {
      const { data, error } = await supabase.rpc("get_command_center_insights", { p_limit: 4 });
      if (error) throw error;
      return (data as unknown as Insight[]) ?? [];
    },
  });
}
