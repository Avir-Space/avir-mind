"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";

import { createClient } from "@/lib/supabase/client";

/** Live notification updates — badge + history + acknowledgments across viewers. */
export function useNotificationRealtime(orgId: string | null | undefined) {
  const supabase = useMemo(() => createClient(), []);
  const qc = useQueryClient();
  // Unique per hook instance: this hook mounts in BOTH the Topbar and the
  // /notifications page. Supabase's .channel(name) returns an EXISTING channel
  // for a duplicate name, and calling .on() on an already-subscribed channel
  // throws ("cannot add postgres_changes callbacks after subscribe()") — which
  // surfaced as the route error boundary. A per-instance name avoids the clash.
  const instanceId = useMemo(() => Math.random().toString(36).slice(2), []);

  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel(`notif-rt-${orgId}-${instanceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notification_events", filter: `org_id=eq.${orgId}` }, () => {
        qc.invalidateQueries({ queryKey: ["notif-history"] });
        qc.invalidateQueries({ queryKey: ["notif-badge"] });
        qc.invalidateQueries({ queryKey: ["signal-notifs"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [orgId, supabase, qc, instanceId]);
}
