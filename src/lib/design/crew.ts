import type { LucideIcon } from "lucide-react";
import { Anchor, Briefcase, Headphones, Plane, Radio, Users, Wrench } from "lucide-react";

export const CREW_ROLE: Record<string, { label: string; icon: LucideIcon }> = {
  captain: { label: "Captain", icon: Plane },
  first_officer: { label: "First Officer", icon: Plane },
  cabin_crew: { label: "Cabin Crew", icon: Users },
  loadmaster: { label: "Loadmaster", icon: Anchor },
  engineer: { label: "Engineer", icon: Wrench },
  ground_operations: { label: "Ground Ops", icon: Briefcase },
  dispatcher: { label: "Dispatcher", icon: Radio },
  other: { label: "Other", icon: Headphones },
};
export const crewRole = (r: string | null) => CREW_ROLE[r ?? "other"] ?? { label: r ?? "—", icon: Users };

export const DUTY_TYPE: Record<string, { label: string; hex: string }> = {
  flight: { label: "Flight", hex: "#1019EC" },
  standby_airport: { label: "Standby (Apt)", hex: "#CA8A04" },
  standby_home: { label: "Standby (Home)", hex: "#EAB308" },
  ground_duty: { label: "Ground", hex: "#6B7280" },
  training: { label: "Training", hex: "#7C3AED" },
  deadhead: { label: "Deadhead", hex: "#0891B2" },
  positioning: { label: "Positioning", hex: "#0D9488" },
  reserve: { label: "Reserve", hex: "#94A3B8" },
};
export const dutyType = (d: string) => DUTY_TYPE[d] ?? { label: d, hex: "#6B7280" };

export const QUAL_TYPE_LABEL: Record<string, string> = {
  type_rating: "Type Rating", endorsement: "Endorsement", medical: "Medical", license: "License",
  recurrent_training: "Recurrent", line_check: "Line Check", route_qual: "Route Qual",
  station_qual: "Station Qual", aircraft_familiarization: "Familiarization", ground_school: "Ground School",
};

export const COMPLIANCE: Record<string, { label: string; hex: string }> = {
  compliant: { label: "Compliant", hex: "#16A34A" },
  warning: { label: "Warning", hex: "#CA8A04" },
  violation: { label: "Violation", hex: "#DC2626" },
};
export const compliance = (c: string) => COMPLIANCE[c] ?? { label: c, hex: "#6B7280" };

export function qualStatusHex(status: string, daysToExpiry: number | null): string {
  if (status !== "valid") return "#DC2626";
  if (daysToExpiry != null && daysToExpiry < 0) return "#DC2626";
  if (daysToExpiry != null && daysToExpiry <= 30) return "#EA580C";
  if (daysToExpiry != null && daysToExpiry <= 60) return "#CA8A04";
  return "#16A34A";
}

export function fatigueBand(score: number | null | undefined): { hex: string; label: string } {
  if (score == null) return { hex: "#6B7280", label: "—" };
  if (score >= 75) return { hex: "#DC2626", label: "Critical" };
  if (score >= 60) return { hex: "#EA580C", label: "Elevated" };
  if (score >= 40) return { hex: "#CA8A04", label: "Moderate" };
  return { hex: "#16A34A", label: "Low" };
}

export const REGULATOR_LABEL: Record<string, string> = {
  faa_part_117: "FAA Part 117", faa_part_121: "FAA Part 121", faa_part_135: "FAA Part 135",
  easa_ftl: "EASA FTL", uk_caa_ftl: "UK CAA FTL", casa_cao_481: "CASA CAO 48.1",
  dgca_car_7: "DGCA CAR-7", transport_canada_602: "TC 602", other: "Other",
};

export const CREW_SIGNAL_CATEGORIES = new Set([
  "crew_currency_gap", "crew_fatigue_risk", "crew_rest_violation", "qualification_expiring_soon",
]);
