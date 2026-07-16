import type { LucideIcon } from "lucide-react";
import {
  BatteryCharging,
  Box,
  CircuitBoard,
  Cog,
  Disc3,
  Fan,
  Wind,
  Zap,
} from "lucide-react";

export const COMPONENT_TYPE_CONFIG: Record<string, { label: string; icon: LucideIcon }> = {
  engine: { label: "Engine", icon: Fan },
  apu: { label: "APU", icon: Zap },
  landing_gear_main: { label: "Main Gear", icon: Disc3 },
  landing_gear_nose: { label: "Nose Gear", icon: Disc3 },
  propeller: { label: "Propeller", icon: Cog },
  avionics_unit: { label: "Avionics", icon: CircuitBoard },
  environmental_control: { label: "ECS", icon: Wind },
  battery: { label: "Battery", icon: BatteryCharging },
  other: { label: "Other", icon: Box },
};

export function componentType(t: string) {
  return COMPONENT_TYPE_CONFIG[t] ?? { label: t, icon: Box };
}

export const COMPONENT_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  on_wing: { label: "On-wing", className: "text-severity-low" },
  off_wing_inventory: { label: "Inventory", className: "text-subtext" },
  off_wing_repair: { label: "In Repair", className: "text-severity-high" },
  scrapped: { label: "Scrapped", className: "text-hint" },
};

/** Health band → color + label. */
export function healthBand(score: number | null | undefined): { hex: string; label: string } {
  if (score == null) return { hex: "#6B7280", label: "Unknown" };
  if (score >= 75) return { hex: "#16A34A", label: "Healthy" };
  if (score >= 50) return { hex: "#CA8A04", label: "Watch" };
  if (score >= 25) return { hex: "#EA580C", label: "Degraded" };
  return { hex: "#DC2626", label: "Critical" };
}

export const HEALTH_BANDS = [
  { value: "healthy", label: "Healthy (75+)", min: 75, max: 100 },
  { value: "watch", label: "Watch (50–74)", min: 50, max: 74 },
  { value: "degraded", label: "Degraded (25–49)", min: 25, max: 49 },
  { value: "critical", label: "Critical (<25)", min: 0, max: 24 },
] as const;

export const FINDING_SEVERITY_HEX: Record<string, string> = {
  nil: "#16A34A",
  minor: "#CA8A04",
  moderate: "#EA580C",
  major: "#DC2626",
  critical: "#DC2626",
};

export const ACCURACY_CONFIG: Record<string, { label: string; hex: string }> = {
  correct: { label: "Correct", hex: "#16A34A" },
  partial: { label: "Partial", hex: "#CA8A04" },
  incorrect: { label: "Incorrect", hex: "#DC2626" },
  pending: { label: "Pending", hex: "#6B7280" },
};

/** Format a prediction horizon into a compact human string. */
export function horizonLabel(h: {
  lower_bound_date?: string;
  upper_bound_date?: string;
  lower_bound_cycles?: number;
  upper_bound_cycles?: number;
  lower_bound_hours?: number;
  upper_bound_hours?: number;
  unit_preference?: string;
} | null | undefined): string | null {
  if (!h) return null;
  const pref = h.unit_preference;
  if ((pref === "date" || !pref) && h.lower_bound_date && h.upper_bound_date) {
    const fmt = (d: string) => new Date(d).toLocaleDateString([], { month: "short", year: "numeric" });
    return `${fmt(h.lower_bound_date)} – ${fmt(h.upper_bound_date)}`;
  }
  if (pref === "cycles" && h.lower_bound_cycles != null && h.upper_bound_cycles != null) {
    return `${h.lower_bound_cycles.toLocaleString()} – ${h.upper_bound_cycles.toLocaleString()} cyc`;
  }
  if (pref === "hours" && h.lower_bound_hours != null && h.upper_bound_hours != null) {
    return `${Math.round(h.lower_bound_hours).toLocaleString()} – ${Math.round(h.upper_bound_hours).toLocaleString()} hrs`;
  }
  if (h.lower_bound_date && h.upper_bound_date) {
    const fmt = (d: string) => new Date(d).toLocaleDateString([], { month: "short", year: "numeric" });
    return `${fmt(h.lower_bound_date)} – ${fmt(h.upper_bound_date)}`;
  }
  return null;
}
