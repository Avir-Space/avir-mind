"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { createClient } from "@/lib/supabase/client";
import { toastMutationError } from "@/lib/mutations/mutation-error";

export type GenerateResult = {
  run_id: string;
  cached: boolean;
  status: string;
  signals_generated?: number;
  error?: string;
};

/**
 * Signal mutations: recording actions (the calibration record) and triggering
 * generation. Generation is a two-step orchestration — the RPC prepares a run
 * (cache + cost guards), then the Edge Function does the Claude call.
 */
export function useSignalActions() {
  const supabase = useMemo(() => createClient(), []);
  const qc = useQueryClient();

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["aircraft-signals"] });
    qc.invalidateQueries({ queryKey: ["signal-insights"] });
    qc.invalidateQueries({ queryKey: ["recent-signal-actions"] });
    qc.invalidateQueries({ queryKey: ["signal-detail"] });
  }, [qc]);

  const act = useMutation({
    mutationFn: async (v: {
      signalId: string;
      actionType: string;
      payload?: Record<string, unknown>;
      outcomeTaskId?: string | null;
      dismissalReason?: string | null;
    }) => {
      const { error } = await supabase.rpc("act_on_signal", {
        p_signal_id: v.signalId,
        p_action_type: v.actionType,
        p_action_payload: (v.payload ?? {}) as never,
        p_outcome_task_id: v.outcomeTaskId ?? undefined,
        p_dismissal_reason: v.dismissalReason ?? undefined,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: toastMutationError,
  });

  /** Prepare a run and, if not cached, invoke the Edge Function. */
  const generate = useCallback(
    async (aircraftId: string, opts?: { force?: boolean; runType?: string }): Promise<GenerateResult> => {
      const { data, error } = await supabase.rpc("generate_signals_for_aircraft", {
        p_aircraft_id: aircraftId,
        p_run_type: opts?.runType ?? "manual",
        p_force_regenerate: opts?.force ?? false,
      });
      if (error) throw error;
      const prep = data as unknown as { run_id: string; cached: boolean; status: string };

      if (prep.cached) {
        invalidate();
        return { ...prep, signals_generated: undefined };
      }

      const { data: fnData, error: fnError } = await supabase.functions.invoke("generate-signals", {
        body: { aircraft_id: aircraftId, run_id: prep.run_id },
      });
      invalidate();
      if (fnError) return { ...prep, error: fnError.message };
      return { ...prep, ...(fnData as object) };
    },
    [supabase, invalidate],
  );

  return { act, generate };
}
