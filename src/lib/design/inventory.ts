import type { LucideIcon } from "lucide-react";
import { Beaker, Box, Boxes, Cpu, Forklift, Gauge, Truck, Warehouse, Wrench } from "lucide-react";

export const PART_CATEGORY: Record<string, { label: string }> = {
  rotable: { label: "Rotable" },
  expendable: { label: "Expendable" },
  consumable: { label: "Consumable" },
  tooling: { label: "Tooling" },
  ground_support: { label: "Ground Support" },
  chemical: { label: "Chemical" },
  other: { label: "Other" },
};
export const partCategory = (c: string | null) => PART_CATEGORY[c ?? "other"] ?? { label: c ?? "—" };

export const CRITICALITY: Record<string, { label: string; hex: string }> = {
  ao_g_critical: { label: "AOG-Critical", hex: "#DC2626" },
  safety_critical: { label: "Safety-Critical", hex: "#EA580C" },
  rotational: { label: "Rotational", hex: "#2563EB" },
  standard: { label: "Standard", hex: "#6B7280" },
  low: { label: "Low", hex: "#94A3B8" },
};
export const criticality = (c: string | null) => CRITICALITY[c ?? "standard"] ?? { label: c ?? "—", hex: "#6B7280" };

export const MOVEMENT_TYPE: Record<string, { label: string; dir: 1 | -1 | 0 }> = {
  receipt: { label: "Receipt", dir: 1 },
  return: { label: "Return", dir: 1 },
  issue: { label: "Issue", dir: -1 },
  consumption: { label: "Consumption", dir: -1 },
  scrap: { label: "Scrap", dir: -1 },
  transfer: { label: "Transfer", dir: 0 },
  adjustment: { label: "Adjustment", dir: 0 },
  reservation: { label: "Reservation", dir: 0 },
  unreservation: { label: "Unreservation", dir: 0 },
};
export const movementType = (m: string) => MOVEMENT_TYPE[m] ?? { label: m, dir: 0 as const };

export const LOCATION_TYPE: Record<string, { label: string; icon: LucideIcon }> = {
  main_warehouse: { label: "Main Warehouse", icon: Warehouse },
  station_stock: { label: "Station Stock", icon: Boxes },
  aircraft_kit: { label: "Aircraft Kit", icon: Box },
  mro_shop: { label: "MRO Shop", icon: Wrench },
  external_consignment: { label: "External Consignment", icon: Truck },
};
export const locationType = (l: string | null) => LOCATION_TYPE[l ?? ""] ?? { label: l ?? "—", icon: Warehouse };

export const ASSET_TYPE: Record<string, { label: string; icon: LucideIcon }> = {
  ground_support_equipment: { label: "GSE", icon: Forklift },
  tooling: { label: "Tooling", icon: Wrench },
  calibrated_instrument: { label: "Calibrated Instrument", icon: Gauge },
  test_equipment: { label: "Test Equipment", icon: Cpu },
  vehicle: { label: "Vehicle", icon: Truck },
  hangar_equipment: { label: "Hangar Equipment", icon: Warehouse },
  other: { label: "Other", icon: Box },
};
export const assetType = (a: string | null) => ASSET_TYPE[a ?? "other"] ?? { label: a ?? "—", icon: Box };

export const ASSET_STATUS: Record<string, { label: string; hex: string }> = {
  in_service: { label: "In Service", hex: "#16A34A" },
  under_maintenance: { label: "Under Maintenance", hex: "#CA8A04" },
  out_of_service: { label: "Out of Service", hex: "#EA580C" },
  retired: { label: "Retired", hex: "#6B7280" },
};
export const assetStatus = (s: string) => ASSET_STATUS[s] ?? { label: s, hex: "#6B7280" };

export const SUPPLIER_TYPE: Record<string, string> = { oem: "OEM", distributor: "Distributor", mro: "MRO", broker: "Broker", other: "Other" };
export const APPROVED_STATUS: Record<string, { label: string; hex: string }> = {
  approved: { label: "Approved", hex: "#16A34A" },
  approved_with_conditions: { label: "Conditional", hex: "#CA8A04" },
  under_review: { label: "Under Review", hex: "#EA580C" },
  suspended: { label: "Suspended", hex: "#DC2626" },
};

export function supplierScoreHex(score: number | null | undefined): string {
  if (score == null) return "#6B7280";
  if (score >= 85) return "#16A34A";
  if (score >= 70) return "#CA8A04";
  return "#DC2626";
}

/** Inventory-related signal categories (for enhanced signal cards). */
export const INVENTORY_SIGNAL_CATEGORIES = new Set([
  "inventory_shortage",
  "alternate_part_opportunity",
  "stock_transfer_opportunity",
  "supplier_risk",
]);
