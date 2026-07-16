"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";

import { createClient } from "@/lib/supabase/client";

/**
 * Subscribes to signal + generation-run changes so the Signals tab, insights
 * strip, and generation progress update live for every viewer.
 */
export function useSignalRealtime(orgId: string | null | undefined) {
  const supabase = useMemo(() => createClient(), []);
  const qc = useQueryClient();

  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel(`signals-rt-${orgId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "signals", filter: `org_id=eq.${orgId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["aircraft-signals"] });
          qc.invalidateQueries({ queryKey: ["signal-insights"] });
          qc.invalidateQueries({ queryKey: ["signal-detail"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "signal_generation_runs", filter: `org_id=eq.${orgId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["aircraft-signals"] });
          qc.invalidateQueries({ queryKey: ["signal-generation-progress"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, supabase, qc]);
}
