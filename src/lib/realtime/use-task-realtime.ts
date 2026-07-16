"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";

import { createClient } from "@/lib/supabase/client";

/**
 * Subscribes to org-scoped task + task_event changes and invalidates the
 * relevant queries so the board and queue update live for every viewer.
 */
export function useTaskRealtime(orgId: string | null | undefined) {
  const supabase = useMemo(() => createClient(), []);
  const qc = useQueryClient();

  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel(`tasks-rt-${orgId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `org_id=eq.${orgId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["command-center"] });
          qc.invalidateQueries({ queryKey: ["fleet-board"] });
          qc.invalidateQueries({ queryKey: ["aircraft-tasks"] });
          qc.invalidateQueries({ queryKey: ["task-detail"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "task_events", filter: `org_id=eq.${orgId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["task-detail"] });
          qc.invalidateQueries({ queryKey: ["command-center"] });
        },
      )
      .on(
        "postgres_changes",
        // aircraft_state has no org_id column; RLS still scopes what we receive.
        { event: "UPDATE", schema: "public", table: "aircraft_state" },
        () => {
          qc.invalidateQueries({ queryKey: ["fleet-board"] });
          qc.invalidateQueries({ queryKey: ["aircraft"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, supabase, qc]);
}
