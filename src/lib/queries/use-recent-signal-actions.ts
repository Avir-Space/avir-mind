"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { createClient } from "@/lib/supabase/client";
import type { SignalAction } from "@/types/signals";

/** Last N signal_actions on an aircraft's signals — the calibration record. */
export function useRecentSignalActions(aircraftId: string, limit = 10) {
  const supabase = useMemo(() => createClient(), []);

  return useQuery({
    queryKey: ["recent-signal-actions", aircraftId],
    enabled: Boolean(aircraftId),
    queryFn: async (): Promise<SignalAction[]> => {
      const { data, error } = await supabase
        .from("signal_actions")
        .select("id, signal_id, action_type, actor_user_id, created_at_utc, dismissal_reason, signals!inner(title, aircraft_id)")
        .eq("signals.aircraft_id", aircraftId)
        .order("created_at_utc", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []).map((r) => {
        const sig = r.signals as unknown as { title: string } | null;
        return {
          id: r.id,
          signal_id: r.signal_id,
          action_type: r.action_type,
          actor_user_id: r.actor_user_id,
          created_at_utc: r.created_at_utc,
          dismissal_reason: r.dismissal_reason,
          signal_title: sig?.title,
        } as SignalAction;
      });
    },
  });
}
