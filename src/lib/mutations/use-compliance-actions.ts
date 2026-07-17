"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { createClient } from "@/lib/supabase/client";
import type { ConformanceBundle } from "@/types/compliance";

export function useComplianceActions() {
  const supabase = useMemo(() => createClient(), []);
  const qc = useQueryClient();

  const invalidate = useCallback(() => {
    for (const k of [
      "compliance-dashboard", "ad-detail", "fleet-mel", "fleet-llps", "reporting-calendar",
      "aircraft-compliance", "dsai-dashboard", "dsai-decisions", "aircraft-signals",
    ]) qc.invalidateQueries({ queryKey: [k] });
  }, [qc]);

  const updateAdStatus = useMutation({
    mutationFn: async (v: { aircraftId: string; adId: string; status: string; attrs?: Record<string, unknown> }) => {
      const { error } = await supabase.rpc("update_aircraft_ad_status", {
        p_aircraft_id: v.aircraftId, p_ad_id: v.adId, p_status: v.status, p_attrs: (v.attrs ?? {}) as never,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deferMel = useMutation({
    mutationFn: async (v: { aircraftId: string; melCatalogId: string; reason?: string }) => {
      const { data, error } = await supabase.rpc("defer_mel_item", {
        p_aircraft_id: v.aircraftId, p_mel_catalog_id: v.melCatalogId, p_reason: v.reason ?? undefined, p_create_task: true,
      });
      if (error) throw error;
      return data as unknown as { id: string; repair_by_date: string; linked_task_id: string | null };
    },
    onSuccess: invalidate,
  });

  const rectifyMel = useMutation({
    mutationFn: async (v: { itemId: string; notes?: string }) => {
      const { error } = await supabase.rpc("rectify_mel_item", { p_item_id: v.itemId, p_notes: v.notes ?? undefined });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const extendMel = useMutation({
    mutationFn: async (v: { itemId: string; authority: string; newDueDate: string }) => {
      const { error } = await supabase.rpc("extend_mel_deferral", {
        p_item_id: v.itemId, p_authority: v.authority, p_new_due_date: v.newDueDate,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const fileReport = useMutation({
    mutationFn: async (v: { id: string; reference?: string }) => {
      const { error } = await supabase.rpc("file_regulatory_report", { p_id: v.id, p_reference: v.reference ?? undefined });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const exportBundle = useCallback(async (fromIso: string, toIso: string): Promise<ConformanceBundle> => {
    const { data, error } = await supabase.rpc("export_dsai_conformance_bundle", { p_from: fromIso, p_to: toIso });
    if (error) throw error;
    return data as unknown as ConformanceBundle;
  }, [supabase]);

  return { updateAdStatus, deferMel, rectifyMel, extendMel, fileReport, exportBundle };
}
