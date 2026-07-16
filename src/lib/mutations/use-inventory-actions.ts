"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { createClient } from "@/lib/supabase/client";

export function useInventoryActions() {
  const supabase = useMemo(() => createClient(), []);
  const qc = useQueryClient();

  const invalidate = useCallback(() => {
    for (const k of ["inventory-dashboard", "parts-overview", "part-detail", "low-stock-alerts",
      "transfer-suggestions", "recent-movements", "locations-overview", "location-detail", "assets",
      "asset-detail", "asset-calendar", "aircraft-parts"]) {
      qc.invalidateQueries({ queryKey: [k] });
    }
  }, [qc]);

  const reserveStock = useMutation({
    mutationFn: async (v: { partId: string; locationId: string; quantity: number; taskId?: string }) => {
      const { error } = await supabase.rpc("reserve_stock", { p_part_id: v.partId, p_location: v.locationId, p_quantity: v.quantity, p_task_id: v.taskId ?? undefined });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const consumeStock = useMutation({
    mutationFn: async (v: { partId: string; locationId: string; quantity: number; taskId?: string }) => {
      const { error } = await supabase.rpc("consume_stock", { p_part_id: v.partId, p_location: v.locationId, p_quantity: v.quantity, p_task_id: v.taskId ?? undefined, p_component_event_id: undefined });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const transferStock = useMutation({
    mutationFn: async (v: { partId: string; from: string; to: string; quantity: number; reference?: string }) => {
      const { error } = await supabase.rpc("transfer_stock", { p_part_id: v.partId, p_from: v.from, p_to: v.to, p_quantity: v.quantity, p_reference: v.reference ?? undefined });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const recordMovement = useMutation({
    mutationFn: async (v: { partId: string; type: string; quantity: number; from?: string; to?: string; reference?: string }) => {
      const { error } = await supabase.rpc("record_stock_movement", {
        p_part_id: v.partId, p_movement_type: v.type, p_quantity: v.quantity,
        p_from_location: v.from ?? undefined, p_to_location: v.to ?? undefined,
        p_attrs: (v.reference ? { reference_number: v.reference } : {}) as never,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const recordAssetEvent = useMutation({
    mutationFn: async (v: { assetId: string; eventType: string; eventDate: string; attrs?: Record<string, unknown> }) => {
      const { error } = await supabase.rpc("record_asset_event", { p_asset_id: v.assetId, p_event_type: v.eventType, p_event_date: v.eventDate, p_attrs: (v.attrs ?? {}) as never });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const generateInventorySignals = useCallback(async () => {
    const { error } = await supabase.rpc("generate_inventory_signals");
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["aircraft-signals"] });
  }, [supabase, qc]);

  return { reserveStock, consumeStock, transferStock, recordMovement, recordAssetEvent, generateInventorySignals };
}
