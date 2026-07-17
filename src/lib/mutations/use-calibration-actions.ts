"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { createClient } from "@/lib/supabase/client";

export function useCalibrationActions() {
  const supabase = useMemo(() => createClient(), []);
  const qc = useQueryClient();

  const invalidate = useCallback(() => {
    for (const k of ["cal-dashboard", "cal-scoreboards", "cal-scoreboard", "cal-publications", "cal-trends"]) {
      qc.invalidateQueries({ queryKey: [k] });
    }
  }, [qc]);

  const generateScoreboard = useMutation({
    mutationFn: async (v: { type?: string; windowDays: number; style?: string }): Promise<string> => {
      const { data, error } = await supabase.rpc("generate_calibration_scoreboard", {
        p_scoreboard_type: v.type ?? "tenant_internal", p_window_days: v.windowDays, p_narrative_style: v.style ?? "balanced",
      });
      if (error) throw error;
      return data as unknown as string;
    },
    onSuccess: invalidate,
  });

  /** Enrich a scoreboard's narrative with Claude Opus (on demand). */
  const regenerateNarrative = useCallback(async (scoreboardId: string) => {
    const { data, error } = await supabase.functions.invoke("generate-calibration-narrative", { body: { scoreboard_id: scoreboardId } });
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["cal-scoreboard", scoreboardId] });
    return data as { ok?: boolean; narrative_source?: string; cost_usd?: number; note?: string };
  }, [supabase, qc]);

  const scoreboardHash = useCallback(async (scoreboardId: string): Promise<string> => {
    const { data, error } = await supabase.rpc("get_scoreboard_content_hash", { p_scoreboard_id: scoreboardId });
    if (error) throw error;
    return data as unknown as string;
  }, [supabase]);

  const publishScoreboard = useMutation({
    mutationFn: async (v: { scoreboardId: string; channel: string; contentHash: string; url?: string }) => {
      const { data, error } = await supabase.rpc("publish_scoreboard", {
        p_scoreboard_id: v.scoreboardId, p_channel: v.channel, p_content_hash: v.contentHash, p_url: v.url ?? undefined,
      });
      if (error) throw error;
      return data as unknown as { publication_id: string; content_hash: string };
    },
    onSuccess: invalidate,
  });

  const markOutcome = useMutation({
    mutationFn: async (v: { signalId: string; result: string; notes?: string }) => {
      const { error } = await supabase.rpc("mark_prediction_outcome", {
        p_signal_id: v.signalId, p_accuracy_result: v.result, p_notes: v.notes ?? undefined,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const exportReport = useCallback(async (windowDays: number): Promise<Record<string, unknown>> => {
    const { data, error } = await supabase.rpc("export_calibration_report", { p_window_days: windowDays });
    if (error) throw error;
    return data as unknown as Record<string, unknown>;
  }, [supabase]);

  return { generateScoreboard, regenerateNarrative, scoreboardHash, publishScoreboard, markOutcome, exportReport };
}
