"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { createClient } from "@/lib/supabase/client";
import type { Signal, SignalAction } from "@/types/signals";

export type SignalDetail = {
  signal: (Signal & { aircraft: { tail_number: string; aircraft_type: string } | null }) | null;
  actions: SignalAction[];
  related: Signal[];
};

/** Full detail for one signal + its action history + related active signals. */
export function useSignalDetail(signalId: string) {
  const supabase = useMemo(() => createClient(), []);

  return useQuery({
    queryKey: ["signal-detail", signalId],
    enabled: Boolean(signalId),
    queryFn: async (): Promise<SignalDetail> => {
      const { data: signal, error } = await supabase
        .from("signals")
        .select("*, aircraft(tail_number, aircraft_type)")
        .eq("id", signalId)
        .maybeSingle();
      if (error) throw error;
      if (!signal) return { signal: null, actions: [], related: [] };

      const [{ data: actions }, { data: related }] = await Promise.all([
        supabase
          .from("signal_actions")
          .select("id, signal_id, action_type, actor_user_id, created_at_utc, dismissal_reason")
          .eq("signal_id", signalId)
          .order("created_at_utc", { ascending: false }),
        supabase
          .from("signals")
          .select("id, aircraft_id, category, severity, title, narrative, confidence, is_active, generated_at_utc")
          .eq("aircraft_id", signal.aircraft_id ?? "")
          .eq("is_active", true)
          .neq("id", signalId)
          .limit(6),
      ]);

      return {
        signal: signal as unknown as SignalDetail["signal"],
        actions: (actions ?? []) as unknown as SignalAction[],
        related: (related ?? []) as unknown as Signal[],
      };
    },
  });
}
