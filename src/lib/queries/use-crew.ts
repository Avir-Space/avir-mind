"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { createClient } from "@/lib/supabase/client";
import type {
  CrewDetail, CrewDirectoryItem, CrewOverlay, CrewStats, ExpiringQual, FatigueForecast, RosterData, RuleConfig,
} from "@/types/crew";

export function useCrewStats() {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["crew-stats"], queryFn: async (): Promise<CrewStats> => {
    const { data, error } = await supabase.rpc("get_crew_stats"); if (error) throw error; return data as unknown as CrewStats;
  } });
}

export function useCrewDirectory() {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["crew-directory"], queryFn: async (): Promise<CrewDirectoryItem[]> => {
    const { data, error } = await supabase.rpc("get_crew_directory"); if (error) throw error; return (data as unknown as CrewDirectoryItem[]) ?? [];
  } });
}

export function useCrewDetail(crewId: string) {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["crew-detail", crewId], enabled: Boolean(crewId), queryFn: async (): Promise<CrewDetail> => {
    const { data, error } = await supabase.rpc("get_crew_detail", { p_crew_member_id: crewId }); if (error) throw error; return data as unknown as CrewDetail;
  } });
}

export function useCrewRoster(start: string, end: string, roles?: string[], base?: string) {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["crew-roster", start, end, roles, base], queryFn: async (): Promise<RosterData> => {
    const { data, error } = await supabase.rpc("get_crew_roster", {
      p_start_date: start, p_end_date: end, p_role: roles?.length ? roles : undefined, p_home_base: base || undefined,
    });
    if (error) throw error; return data as unknown as RosterData;
  } });
}

export function useExpiringQualifications(days = 30) {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["expiring-quals", days], queryFn: async (): Promise<ExpiringQual[]> => {
    const { data, error } = await supabase.rpc("get_expiring_qualifications", { p_days: days }); if (error) throw error; return (data as unknown as ExpiringQual[]) ?? [];
  } });
}

export function useFatigueForecast(crewId: string, days = 14) {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["fatigue-forecast", crewId, days], enabled: Boolean(crewId), queryFn: async (): Promise<FatigueForecast> => {
    const { data, error } = await supabase.rpc("get_fatigue_forecast", { p_crew_member_id: crewId, p_forecast_days: days }); if (error) throw error; return data as unknown as FatigueForecast;
  } });
}

export function useRuleConfigurations() {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["rule-configs"], queryFn: async (): Promise<RuleConfig[]> => {
    const { data, error } = await supabase.rpc("get_rule_configurations"); if (error) throw error; return (data as unknown as RuleConfig[]) ?? [];
  } });
}

export function useCrewOverlay(fleetId: string | null, enabled: boolean) {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["crew-overlay", fleetId], enabled, queryFn: async (): Promise<CrewOverlay> => {
    const { data, error } = await supabase.rpc("get_crew_overlay", { p_fleet_id: fleetId ?? undefined }); if (error) throw error; return data as unknown as CrewOverlay;
  } });
}

/** Upcoming flight schedules (roster assignment targets). */
export function useUpcomingFlights() {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["upcoming-flights"], queryFn: async () => {
    const { data, error } = await supabase.from("flight_schedules")
      .select("id, flight_number, origin_station, destination_station, scheduled_departure_utc, scheduled_arrival_utc, aircraft_id, aircraft(tail_number, aircraft_type)")
      .gte("scheduled_departure_utc", new Date().toISOString()).order("scheduled_departure_utc").limit(40);
    if (error) throw error; return data ?? [];
  } });
}

/** Recent + upcoming assignments for the Assignments tab. */
export function useAssignments() {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["crew-assignments"], queryFn: async () => {
    const { data, error } = await supabase.from("assignments")
      .select("id, role_on_flight, assignment_status, assigned_at_utc, crew_members(first_name, last_name, role), flight_schedules(flight_number, origin_station, destination_station, scheduled_departure_utc)")
      .order("assigned_at_utc", { ascending: false }).limit(50);
    if (error) throw error; return data ?? [];
  } });
}
