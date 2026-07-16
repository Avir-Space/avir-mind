"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { createClient } from "@/lib/supabase/client";

export type PredictResult = {
  run_id: string;
  cached: boolean;
  status: string;
  predictions_generated?: number;
  error?: string;
};

/** Component mutations: record events, move off-wing, change position, and the
 *  two-step predictive generation (RPC prepares a run → Edge Function). */
export function useComponentActions() {
  const supabase = useMemo(() => createClient(), []);
  const qc = useQueryClient();

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["components"] });
    qc.invalidateQueries({ queryKey: ["component-detail"] });
    qc.invalidateQueries({ queryKey: ["aircraft-components"] });
    qc.invalidateQueries({ queryKey: ["aircraft-signals"] });
  }, [qc]);

  const recordEvent = useMutation({
    mutationFn: async (v: { componentId: string; eventType: string; eventDate: string; attrs?: Record<string, unknown> }) => {
      const { error } = await supabase.rpc("record_component_event", {
        p_component_id: v.componentId,
        p_event_type: v.eventType,
        p_event_date: v.eventDate,
        p_attrs: (v.attrs ?? {}) as never,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const moveOffWing = useMutation({
    mutationFn: async (v: { componentId: string; eventDate: string }) => {
      const { error } = await supabase.rpc("record_component_event", {
        p_component_id: v.componentId,
        p_event_type: "removed",
        p_event_date: v.eventDate,
        p_attrs: {} as never,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const changePosition = useMutation({
    mutationFn: async (v: { componentId: string; positionCode: string }) => {
      const { error } = await supabase
        .from("components")
        .update({ position_code: v.positionCode, updated_at_utc: new Date().toISOString() } as never)
        .eq("id", v.componentId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  /** Prepare a predictive run and, if not cached, invoke the Edge Function. */
  const generatePredictions = useCallback(
    async (target: { aircraftId?: string; componentId?: string }, opts?: { force?: boolean; runType?: string }): Promise<PredictResult> => {
      const rpc = target.componentId ? "generate_predictive_signals_for_component" : "generate_predictive_signals_for_aircraft";
      const args = target.componentId
        ? { p_component_id: target.componentId, p_run_type: opts?.runType ?? "manual", p_force_regenerate: opts?.force ?? false }
        : { p_aircraft_id: target.aircraftId!, p_run_type: opts?.runType ?? "manual", p_force_regenerate: opts?.force ?? false };
      const { data, error } = await supabase.rpc(rpc, args as never);
      if (error) throw error;
      const prep = data as unknown as { run_id: string; cached: boolean; status: string };
      if (prep.cached) {
        invalidate();
        return prep;
      }
      const { data: fnData, error: fnErr } = await supabase.functions.invoke("generate-predictive-signals", {
        body: { aircraft_id: target.aircraftId, component_id: target.componentId, run_id: prep.run_id },
      });
      invalidate();
      if (fnErr) return { ...prep, error: fnErr.message };
      return { ...prep, ...(fnData as object) };
    },
    [supabase, invalidate],
  );

  return { recordEvent, moveOffWing, changePosition, generatePredictions };
}
