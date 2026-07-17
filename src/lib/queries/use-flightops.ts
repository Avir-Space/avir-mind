"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { createClient } from "@/lib/supabase/client";
import type {
  DailyOps, DispatchQueueItem, FlightDetail, FlightEventItem, FlightListItem, WeatherBoardItem, WeatherOverlay,
} from "@/types/flightops";

export function useDailyOps() {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["daily-ops"], queryFn: async (): Promise<DailyOps> => {
    const { data, error } = await supabase.rpc("get_daily_ops_summary"); if (error) throw error; return data as unknown as DailyOps;
  } });
}

export function useFlightsList(from?: string, to?: string) {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["flights-list", from, to], queryFn: async (): Promise<FlightListItem[]> => {
    const { data, error } = await supabase.rpc("get_flights_list", { p_from: from ?? undefined, p_to: to ?? undefined });
    if (error) throw error; return (data as unknown as FlightListItem[]) ?? [];
  } });
}

export function useFlightDetail(flightId: string) {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["flight-detail", flightId], enabled: Boolean(flightId), queryFn: async (): Promise<FlightDetail> => {
    const { data, error } = await supabase.rpc("get_flight_detail", { p_flight_id: flightId }); if (error) throw error; return data as unknown as FlightDetail;
  } });
}

export function useDispatchQueue() {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["dispatch-queue"], queryFn: async (): Promise<DispatchQueueItem[]> => {
    const { data, error } = await supabase.rpc("get_dispatch_queue"); if (error) throw error; return (data as unknown as DispatchQueueItem[]) ?? [];
  } });
}

export function useWeatherBoard() {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["weather-board"], queryFn: async (): Promise<WeatherBoardItem[]> => {
    const { data, error } = await supabase.rpc("get_weather_board"); if (error) throw error; return (data as unknown as WeatherBoardItem[]) ?? [];
  } });
}

export function useWeatherOverlay(enabled: boolean) {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["weather-overlay"], enabled, queryFn: async (): Promise<WeatherOverlay> => {
    const { data, error } = await supabase.rpc("get_weather_overlay"); if (error) throw error; return data as unknown as WeatherOverlay;
  } });
}

export function useRecentFlightEvents(limit = 30) {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["recent-flight-events", limit], refetchInterval: 30_000, queryFn: async (): Promise<FlightEventItem[]> => {
    const { data, error } = await supabase.rpc("get_recent_flight_events", { p_limit: limit }); if (error) throw error; return (data as unknown as FlightEventItem[]) ?? [];
  } });
}
