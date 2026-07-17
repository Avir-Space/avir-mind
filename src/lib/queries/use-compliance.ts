"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { createClient } from "@/lib/supabase/client";
import type {
  ADDetail, AircraftComplianceSummary, AuditTrail, ComplianceDashboard, DecisionRow, DsaiStats,
  LlpRow, MelItem, ModelVersionReport, OversightRow, RegReport,
} from "@/types/compliance";

export function useComplianceDashboard() {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["compliance-dashboard"], queryFn: async (): Promise<ComplianceDashboard> => {
    const { data, error } = await supabase.rpc("get_fleet_compliance_dashboard"); if (error) throw error;
    return data as unknown as ComplianceDashboard;
  } });
}

export function useAdDetail(adId: string | null) {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["ad-detail", adId], enabled: Boolean(adId), queryFn: async (): Promise<ADDetail> => {
    const { data, error } = await supabase.rpc("get_ad_detail", { p_ad_id: adId! }); if (error) throw error;
    return data as unknown as ADDetail;
  } });
}

export function useFleetMel() {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["fleet-mel"], queryFn: async (): Promise<MelItem[]> => {
    const { data, error } = await supabase.rpc("get_fleet_mel_items"); if (error) throw error;
    return (data as unknown as MelItem[]) ?? [];
  } });
}

export function useFleetLlps() {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["fleet-llps"], queryFn: async (): Promise<LlpRow[]> => {
    const { data, error } = await supabase.rpc("get_fleet_llps"); if (error) throw error;
    return (data as unknown as LlpRow[]) ?? [];
  } });
}

export function useReportingCalendar() {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["reporting-calendar"], queryFn: async (): Promise<RegReport[]> => {
    const { data, error } = await supabase.rpc("get_reporting_calendar"); if (error) throw error;
    return (data as unknown as RegReport[]) ?? [];
  } });
}

export function useAircraftCompliance(aircraftId: string) {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["aircraft-compliance", aircraftId], enabled: Boolean(aircraftId), queryFn: async (): Promise<AircraftComplianceSummary> => {
    const { data, error } = await supabase.rpc("get_aircraft_compliance_summary", { p_aircraft_id: aircraftId }); if (error) throw error;
    return data as unknown as AircraftComplianceSummary;
  } });
}

/** Active compliance-engine signals for the AI insights strip. */
export function useComplianceSignals() {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["compliance-signals"], queryFn: async () => {
    const { data, error } = await supabase
      .from("signals")
      .select("id, aircraft_id, category, severity, title, narrative, recommendation, generated_at_utc")
      .eq("generated_by_model", "compliance-engine")
      .eq("is_active", true)
      .order("generated_at_utc", { ascending: false });
    if (error) throw error;
    return data ?? [];
  } });
}

// ── DS.AI ──
export function useDsaiDashboard() {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["dsai-dashboard"], queryFn: async (): Promise<DsaiStats> => {
    const { data, error } = await supabase.rpc("get_dsai_dashboard"); if (error) throw error;
    return data as unknown as DsaiStats;
  } });
}

export function useDsaiDecisions(filters: { type?: string; model?: string; confidence?: string } = {}) {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["dsai-decisions", filters], queryFn: async (): Promise<DecisionRow[]> => {
    const { data, error } = await supabase.rpc("get_dsai_decisions", {
      p_type: filters.type ?? undefined, p_model: filters.model ?? undefined, p_confidence: filters.confidence ?? undefined,
    }); if (error) throw error;
    return (data as unknown as DecisionRow[]) ?? [];
  } });
}

export function useDsaiOversight() {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["dsai-oversight"], queryFn: async (): Promise<OversightRow[]> => {
    const { data, error } = await supabase.rpc("get_dsai_oversight", {}); if (error) throw error;
    return (data as unknown as OversightRow[]) ?? [];
  } });
}

export function useModelVersionReport() {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["model-version-report"], queryFn: async (): Promise<ModelVersionReport> => {
    const { data, error } = await supabase.rpc("get_model_version_report"); if (error) throw error;
    return data as unknown as ModelVersionReport;
  } });
}

/** Data lineage for a specific decision (Lineage tab). */
export function useDataLineage(decisionId: string | null) {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["data-lineage", decisionId], enabled: Boolean(decisionId), queryFn: async () => {
    const { data, error } = await supabase.rpc("get_data_lineage_report", { p_decision_id: decisionId! }); if (error) throw error;
    return data as unknown as { decision: Record<string, unknown>; sources: Array<{ id: string; source_table: string; source_row_id: string; source_data_snapshot: Record<string, unknown> | null; source_data_generated_by: string | null }> };
  } });
}

/** Full audit trail for a signal (used by the signal-card drawer). */
export function useAuditTrail(signalId: string | null) {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["audit-trail", signalId], enabled: Boolean(signalId), queryFn: async (): Promise<AuditTrail> => {
    const { data, error } = await supabase.rpc("get_ai_decision_audit_trail", { p_signal_id: signalId! }); if (error) throw error;
    return data as unknown as AuditTrail;
  } });
}
