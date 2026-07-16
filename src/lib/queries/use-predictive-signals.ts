"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { createClient } from "@/lib/supabase/client";
import type { PredictiveSignal } from "@/types/components";

/** Predictive / insufficient-data signals for the Signals class filter. */
export function usePredictiveSignals(signalClass: "prediction" | "insufficient_data") {
  const supabase = useMemo(() => createClient(), []);

  return useQuery({
    queryKey: ["predictive-signals", signalClass],
    queryFn: async (): Promise<PredictiveSignal[]> => {
      const { data, error } = await supabase
        .from("signals")
        .select("*")
        .eq("is_active", true)
        .eq("signal_class", signalClass)
        .order("generated_at_utc", { ascending: false });
      if (error) throw error;
      return (data as unknown as PredictiveSignal[]) ?? [];
    },
  });
}
