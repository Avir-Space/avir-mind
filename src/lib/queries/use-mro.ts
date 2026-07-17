"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { createClient } from "@/lib/supabase/client";

type J = Record<string, unknown>;

export function useShopFloor() {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["shop-floor"], queryFn: async () => {
    const { data, error } = await supabase.rpc("get_shop_floor_view"); if (error) throw error; return (data as unknown as J[]) ?? [];
  } });
}
export function useCustomers() {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["customers"], queryFn: async () => {
    const { data, error } = await supabase.rpc("get_customer_accounts"); if (error) throw error; return (data as unknown as J[]) ?? [];
  } });
}
export function useCustomerDashboard(id: string) {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["customer", id], enabled: Boolean(id), queryFn: async () => {
    const { data, error } = await supabase.rpc("get_customer_dashboard", { p_customer_id: id }); if (error) throw error; return data as unknown as J;
  } });
}
export function useContracts() {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["contracts"], queryFn: async () => {
    const { data, error } = await supabase.rpc("get_service_contracts"); if (error) throw error; return (data as unknown as J[]) ?? [];
  } });
}
export function useContractDetail(id: string) {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["contract", id], enabled: Boolean(id), queryFn: async () => {
    const { data, error } = await supabase.rpc("get_contract_detail", { p_id: id }); if (error) throw error; return data as unknown as J;
  } });
}
export function useWorkPackages() {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["work-packages"], queryFn: async () => {
    const { data, error } = await supabase.rpc("get_work_packages"); if (error) throw error; return (data as unknown as J[]) ?? [];
  } });
}
export function useWorkPackageDetail(id: string) {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["work-package", id], enabled: Boolean(id), refetchInterval: 4000, queryFn: async () => {
    const { data, error } = await supabase.rpc("get_work_package_detail", { p_id: id }); if (error) throw error; return data as unknown as J;
  } });
}
export function useWipSummary() {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["wip"], queryFn: async () => {
    const { data, error } = await supabase.rpc("get_wip_summary"); if (error) throw error; return data as unknown as J;
  } });
}
export function useExpiringContracts() {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["expiring-contracts"], queryFn: async () => {
    const { data, error } = await supabase.rpc("get_expiring_contracts", { p_days: 90 }); if (error) throw error; return (data as unknown as J[]) ?? [];
  } });
}
export function useCustomerReports(customerId: string) {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["customer-reports", customerId], enabled: Boolean(customerId), queryFn: async () => {
    const { data, error } = await supabase.rpc("get_customer_reports", { p_customer_id: customerId }); if (error) throw error; return (data as unknown as J[]) ?? [];
  } });
}
export function useAircraftServiceContext(aircraftId: string, enabled: boolean) {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["service-context", aircraftId], enabled: enabled && Boolean(aircraftId), queryFn: async () => {
    const { data, error } = await supabase.rpc("get_aircraft_service_context", { p_aircraft_id: aircraftId }); if (error) throw error; return data as unknown as J | null;
  } });
}

