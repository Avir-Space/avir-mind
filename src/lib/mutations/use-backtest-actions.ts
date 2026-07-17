"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { createClient } from "@/lib/supabase/client";

export function useBacktestActions() {
  const supabase = useMemo(() => createClient(), []);
  const qc = useQueryClient();

  const invalidate = useCallback((id?: string) => {
    for (const k of ["backtest-projects", "backtest-project", "backtest-summary", "backtest-signals", "backtest-events", "backtest-reports"]) {
      qc.invalidateQueries({ queryKey: id ? [k, id] : [k] });
    }
    qc.invalidateQueries({ queryKey: ["backtest-projects"] });
  }, [qc]);

  const createProject = useMutation({
    mutationFn: async (attrs: Record<string, unknown>): Promise<{ id: string; upload_path_prefix: string }> => {
      const { data, error } = await supabase.rpc("create_backtest_project", { p: attrs as never });
      if (error) throw error;
      return data as unknown as { id: string; upload_path_prefix: string };
    },
    onSuccess: () => invalidate(),
  });

  /** Upload a file's text to the ingest edge function. */
  const ingest = useCallback(async (v: { projectId: string; sourceType: string; fileName: string; content: string }) => {
    const { data, error } = await supabase.functions.invoke("ingest-backtest-data", {
      body: { backtest_project_id: v.projectId, source_type: v.sourceType, source_file_name: v.fileName, content: v.content },
    });
    if (error) throw error;
    invalidate(v.projectId);
    return data as { ok?: boolean; states_ingested?: number; actual_events_ingested?: number; error_count?: number; error?: string };
  }, [supabase, invalidate]);

  const execute = useCallback(async (projectId: string, runType = "full_replay") => {
    const { data, error } = await supabase.functions.invoke("run-backtest-simulation", { body: { backtest_project_id: projectId, run_type: runType } });
    if (error) throw error;
    invalidate(projectId);
    return data as { ok?: boolean; run_id?: string; error?: string };
  }, [supabase, invalidate]);

  const generateReport = useMutation({
    mutationFn: async (v: { projectId: string; reportType?: string }): Promise<string> => {
      const { data, error } = await supabase.rpc("generate_backtest_report", { p_project: v.projectId, p_report_type: v.reportType ?? "executive_summary" });
      if (error) throw error;
      return data as unknown as string;
    },
    onSuccess: (_d, v) => invalidate(v.projectId),
  });

  const shareReport = useMutation({
    mutationFn: async (v: { reportId: string; recipient: string; channel?: string }) => {
      const { error } = await supabase.rpc("share_backtest_report", { p_report: v.reportId, p_recipient: v.recipient, p_channel: v.channel ?? "email" });
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
  });

  return { createProject, ingest, execute, generateReport, shareReport };
}
