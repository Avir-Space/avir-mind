"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { createClient } from "@/lib/supabase/client";
import type {
  AssetCalendarItem, InventoryDashboard, LocationDetail, LowStockAlert, PartDetail, PartOverview,
  SupplierDetail, SupplierPerf, TransferSuggestion,
} from "@/types/inventory";

export function useInventoryDashboard() {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({
    queryKey: ["inventory-dashboard"],
    queryFn: async (): Promise<InventoryDashboard> => {
      const { data, error } = await supabase.rpc("get_inventory_dashboard");
      if (error) throw error;
      return data as unknown as InventoryDashboard;
    },
  });
}

export function usePartsOverview() {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({
    queryKey: ["parts-overview"],
    queryFn: async (): Promise<PartOverview[]> => {
      const { data, error } = await supabase.rpc("get_parts_overview");
      if (error) throw error;
      return (data as unknown as PartOverview[]) ?? [];
    },
  });
}

export function usePartDetail(partId: string) {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({
    queryKey: ["part-detail", partId],
    enabled: Boolean(partId),
    queryFn: async (): Promise<PartDetail> => {
      const { data, error } = await supabase.rpc("get_part_detail", { p_part_id: partId });
      if (error) throw error;
      return data as unknown as PartDetail;
    },
  });
}

export function useLowStockAlerts() {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({
    queryKey: ["low-stock-alerts"],
    queryFn: async (): Promise<LowStockAlert[]> => {
      const { data, error } = await supabase.rpc("get_low_stock_alerts");
      if (error) throw error;
      return (data as unknown as LowStockAlert[]) ?? [];
    },
  });
}

export function useTransferSuggestions() {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({
    queryKey: ["transfer-suggestions"],
    queryFn: async (): Promise<TransferSuggestion[]> => {
      const { data, error } = await supabase.rpc("get_stock_transfer_suggestions");
      if (error) throw error;
      return (data as unknown as TransferSuggestion[]) ?? [];
    },
  });
}

export function useRecentMovements() {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({
    queryKey: ["recent-movements"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_recent_movements", { p_limit: 100 });
      if (error) throw error;
      return (data as unknown as (Record<string, unknown> & { id: string })[]) ?? [];
    },
  });
}

export function useLocationsOverview() {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({
    queryKey: ["locations-overview"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_locations_overview");
      if (error) throw error;
      return (data as unknown as (Record<string, unknown> & { id: string; location_code: string })[]) ?? [];
    },
  });
}

export function useLocationDetail(locationId: string) {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({
    queryKey: ["location-detail", locationId],
    enabled: Boolean(locationId),
    queryFn: async (): Promise<LocationDetail> => {
      const { data, error } = await supabase.rpc("get_location_detail", { p_location_id: locationId });
      if (error) throw error;
      return data as unknown as LocationDetail;
    },
  });
}

export function useSupplierPerformance() {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({
    queryKey: ["supplier-performance"],
    queryFn: async (): Promise<SupplierPerf[]> => {
      const { data, error } = await supabase.rpc("get_supplier_performance");
      if (error) throw error;
      return (data as unknown as SupplierPerf[]) ?? [];
    },
  });
}

export function useSupplierDetail(supplierId: string) {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({
    queryKey: ["supplier-detail", supplierId],
    enabled: Boolean(supplierId),
    queryFn: async (): Promise<SupplierDetail> => {
      const { data, error } = await supabase.rpc("get_supplier_detail", { p_supplier_id: supplierId });
      if (error) throw error;
      return data as unknown as SupplierDetail;
    },
  });
}

export function useAssets() {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({
    queryKey: ["assets"],
    queryFn: async () => {
      const { data, error } = await supabase.from("assets").select("*").order("asset_tag");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAssetDetail(assetId: string) {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({
    queryKey: ["asset-detail", assetId],
    enabled: Boolean(assetId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_asset_detail", { p_asset_id: assetId });
      if (error) throw error;
      return data as unknown as { asset: Record<string, unknown>; location: { location_code: string; location_name: string } | null; events: Record<string, unknown>[] };
    },
  });
}

export function useAssetServiceCalendar(days = 90) {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({
    queryKey: ["asset-calendar", days],
    queryFn: async (): Promise<AssetCalendarItem[]> => {
      const { data, error } = await supabase.rpc("get_asset_service_calendar", { p_days: days });
      if (error) throw error;
      return (data as unknown as AssetCalendarItem[]) ?? [];
    },
  });
}

export function useAircraftParts(aircraftId: string) {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({
    queryKey: ["aircraft-parts", aircraftId],
    enabled: Boolean(aircraftId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_aircraft_parts", { p_aircraft_id: aircraftId });
      if (error) throw error;
      return data as unknown as {
        aircraft_type: string; base_station: string | null; predicted_demand: number;
        parts: { id: string; part_number: string; description: string; category: string | null; criticality: string | null; current_price_usd: number | null; typical_lead_time_days: number | null; total_available: number; available_at_base: number }[];
      };
    },
  });
}
