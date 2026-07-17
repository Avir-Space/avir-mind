"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { createClient } from "@/lib/supabase/client";
import type {
  CalBadgeMap, CalibrationDashboard, CategoryDetail, PublicationRow, Scoreboard, ScoreboardListRow, TrendPoint,
} from "@/types/calibration";

export function useCalibrationDashboard(windowDays: number) {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["cal-dashboard", windowDays], queryFn: async (): Promise<CalibrationDashboard> => {
    const { data, error } = await supabase.rpc("get_tenant_calibration_dashboard", { p_window_days: windowDays });
    if (error) throw error; return data as unknown as CalibrationDashboard;
  } });
}

export function useCalibrationCategory(category: string, windowDays: number) {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["cal-category", category, windowDays], enabled: Boolean(category), queryFn: async (): Promise<CategoryDetail> => {
    const { data, error } = await supabase.rpc("get_calibration_category_detail", { p_category: category, p_window_days: windowDays });
    if (error) throw error; return data as unknown as CategoryDetail;
  } });
}

export function useCalibrationTrends() {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["cal-trends"], queryFn: async (): Promise<TrendPoint[]> => {
    const { data, error } = await supabase.rpc("get_calibration_trends"); if (error) throw error;
    return (data as unknown as TrendPoint[]) ?? [];
  } });
}

/** category|confidence → badge. Fetched once, looked up per signal card. */
export function useCalibrationBadgeMap() {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["cal-badge-map"], staleTime: 5 * 60_000, queryFn: async (): Promise<CalBadgeMap> => {
    const { data, error } = await supabase.rpc("get_calibration_badge_map"); if (error) throw error;
    return (data as unknown as CalBadgeMap) ?? {};
  } });
}

export function useCalibrationScoreboards() {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["cal-scoreboards"], queryFn: async (): Promise<ScoreboardListRow[]> => {
    const { data, error } = await supabase.rpc("get_calibration_scoreboards"); if (error) throw error;
    return (data as unknown as ScoreboardListRow[]) ?? [];
  } });
}

export function useScoreboard(id: string | null) {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["cal-scoreboard", id], enabled: Boolean(id), queryFn: async (): Promise<Scoreboard> => {
    const { data, error } = await supabase.rpc("get_scoreboard", { p_id: id! }); if (error) throw error;
    return data as unknown as Scoreboard;
  } });
}

export function useCalibrationPublications() {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["cal-publications"], queryFn: async (): Promise<PublicationRow[]> => {
    const { data, error } = await supabase.rpc("get_calibration_publications"); if (error) throw error;
    return (data as unknown as PublicationRow[]) ?? [];
  } });
}
