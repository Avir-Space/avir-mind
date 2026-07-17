"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";

import { createClient } from "@/lib/supabase/client";

/** Subscribes to flight + flight_event changes so ops surfaces update live. */
export function useFlightRealtime(orgId: string | null | undefined) {
  const supabase = useMemo(() => createClient(), []);
  const qc = useQueryClient();

  useEffect(() => {
    if (!orgId) return;
    const invalidate = () => {
      for (const k of ["flight-detail", "flights-list", "daily-ops", "dispatch-queue", "recent-flight-events"]) {
        qc.invalidateQueries({ queryKey: [k] });
      }
    };
    const channel = supabase
      .channel(`flights-rt-${orgId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "flights", filter: `org_id=eq.${orgId}` }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "flight_events", filter: `org_id=eq.${orgId}` }, invalidate)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [orgId, supabase, qc]);
}
