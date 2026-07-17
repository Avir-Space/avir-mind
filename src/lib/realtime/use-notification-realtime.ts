"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";

import { createClient } from "@/lib/supabase/client";

/** Live notification updates — badge + history + acknowledgments across viewers. */
export function useNotificationRealtime(orgId: string | null | undefined) {
  const supabase = useMemo(() => createClient(), []);
  const qc = useQueryClient();

  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel(`notif-rt-${orgId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notification_events", filter: `org_id=eq.${orgId}` }, () => {
        qc.invalidateQueries({ queryKey: ["notif-history"] });
        qc.invalidateQueries({ queryKey: ["notif-badge"] });
        qc.invalidateQueries({ queryKey: ["signal-notifs"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [orgId, supabase, qc]);
}
