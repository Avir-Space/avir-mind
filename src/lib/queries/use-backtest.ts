"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { createClient } from "@/lib/supabase/client";
import type {
  ActualEvent, BacktestProject, BacktestReport, BacktestSummary, CategoryDetail, ProjectDetail, SimulatedSignal,
} from "@/types/backtest";

export function useBacktestProjects() {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["backtest-projects"], queryFn: async (): Promise<BacktestProject[]> => {
    const { data, error } = await supabase.rpc("get_backtest_projects"); if (error) throw error;
    return (data as unknown as BacktestProject[]) ?? [];
  } });
}

export function useBacktestProject(id: string) {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["backtest-project", id], enabled: Boolean(id), refetchInterval: (q) => {
    const st = (q.state.data as ProjectDetail | undefined)?.project?.status;
    return st === "running" || st === "ingesting" ? 2500 : false;
  }, queryFn: async (): Promise<ProjectDetail> => {
    const { data, error } = await supabase.rpc("get_backtest_project", { p_project: id }); if (error) throw error;
    return data as unknown as ProjectDetail;
  } });
}

export function useBacktestSummary(id: string, enabled = true) {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["backtest-summary", id], enabled: Boolean(id) && enabled, queryFn: async (): Promise<BacktestSummary> => {
    const { data, error } = await supabase.rpc("get_backtest_summary", { p_project: id }); if (error) throw error;
    return data as unknown as BacktestSummary;
  } });
}

export function useSimulatedSignals(id: string, filters: { cls?: string; category?: string; match?: string } = {}) {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["backtest-signals", id, filters], enabled: Boolean(id), queryFn: async (): Promise<SimulatedSignal[]> => {
    const { data, error } = await supabase.rpc("get_backtest_simulated_signals", {
      p_project: id, p_class: filters.cls ?? undefined, p_category: filters.category ?? undefined, p_match: filters.match ?? undefined,
    }); if (error) throw error;
    return (data as unknown as SimulatedSignal[]) ?? [];
  } });
}

export function useActualEvents(id: string) {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["backtest-events", id], enabled: Boolean(id), queryFn: async (): Promise<ActualEvent[]> => {
    const { data, error } = await supabase.rpc("get_backtest_actual_events", { p_project: id }); if (error) throw error;
    return (data as unknown as ActualEvent[]) ?? [];
  } });
}

export function useBacktestCategory(id: string, category: string) {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["backtest-category", id, category], enabled: Boolean(id && category), queryFn: async (): Promise<CategoryDetail> => {
    const { data, error } = await supabase.rpc("get_backtest_category_detail", { p_project: id, p_category: category }); if (error) throw error;
    return data as unknown as CategoryDetail;
  } });
}

export function useBacktestReports(id: string) {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["backtest-reports", id], enabled: Boolean(id), queryFn: async (): Promise<BacktestReport[]> => {
    const { data, error } = await supabase.rpc("get_backtest_reports", { p_project: id }); if (error) throw error;
    return (data as unknown as BacktestReport[]) ?? [];
  } });
}
